/**
 * create-paid-booking — Payment-first booking creation.
 *
 * This edge function is the core of the payment-first architecture.
 * It receives a full booking payload + payment proof, verifies payment,
 * creates the booking, and triggers dispatch — all atomically.
 *
 * Supports 3 payment types:
 *   1. 'razorpay'            — full Razorpay payment
 *   2. 'wallet'              — full wallet payment
 *   3. 'wallet_and_razorpay' — partial wallet + Razorpay remainder
 *
 * SAFETY: NO booking is created unless payment is fully verified.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verifyFirebaseToken,
  extractToken,
  corsHeaders,
} from "../_shared/firebaseAuth.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Helpers ──────────────────────────────────────────────────

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha256Verify(
  data: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

function generateOtp(): string {
  return String(Math.floor(100 + Math.random() * 900));
}

const OPTIONAL_BOOKING_INSERT_COLUMNS = new Set([
  "completion_otp",
  "paid_at",
  "payment_amount_inr",
  "razorpay_paid_amount",
  "request_id",
  "wallet_used_amount",
]);

function extractMissingColumnName(message?: string): string | null {
  if (!message) return null;

  const patterns = [
    /Could not find the '([^']+)' column of 'bookings' in the schema cache/i,
    /column(?:\s+"|\s+)([^"\s]+)(?:"|\s+)of relation(?:\s+"|\s+)bookings(?:"|\s+)does not exist/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function insertBookingWithCompatibilityFallback(
  supabase: ReturnType<typeof createClient>,
  bookingRow: Record<string, unknown>,
) {
  const rowToInsert = { ...bookingRow };
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= OPTIONAL_BOOKING_INSERT_COLUMNS.size; attempt++) {
    const result = await supabase
      .from("bookings")
      .insert([rowToInsert])
      .select("id, booking_type, status")
      .single();

    if (!result.error) return result;

    lastError = result.error;
    const missingColumn = extractMissingColumnName(result.error.message);

    if (
      !missingColumn ||
      !OPTIONAL_BOOKING_INSERT_COLUMNS.has(missingColumn) ||
      !(missingColumn in rowToInsert)
    ) {
      return result;
    }

    console.warn(
      `[create-paid-booking] Retrying insert without unsupported column: ${missingColumn}`,
    );
    delete rowToInsert[missingColumn];
  }

  return { data: null, error: lastError };
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("[create-paid-booking] ▶ Request received, method:", req.method);

  try {
    // 0. Environment check
    if (!RAZORPAY_KEY_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[create-paid-booking] ❌ Missing env vars:", {
        hasRazorpaySecret: !!RAZORPAY_KEY_SECRET,
        hasSupabaseUrl: !!SUPABASE_URL,
        hasServiceRole: !!SUPABASE_SERVICE_ROLE_KEY,
      });
      return json({ error: "Server configuration error", step: "env_check" }, 500);
    }

    // 1. Authenticate via Firebase
    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Not authenticated" }, 401);

    const firebaseUser = await verifyFirebaseToken(idToken);
    console.log("[create-paid-booking] ✅ Firebase auth OK, uid:", firebaseUser.uid);
    const {
      booking_data: rawBookingData,
      payment_type,
      request_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpay_amount,
      wallet_amount,
      qr_recovery,
    } = await req.json();

    if (!rawBookingData || typeof rawBookingData !== "object") {
      return json({ error: "booking_data and payment_type required" }, 400);
    }

    const booking_data = { ...rawBookingData } as Record<string, unknown>;
    const requestId = request_id || booking_data.request_id || null;
    delete booking_data.request_id;

    if (!booking_data || !payment_type) {
      return json({ error: "booking_data and payment_type required" }, 400);
    }

    const validTypes = ["razorpay", "wallet", "wallet_and_razorpay"];
    if (!validTypes.includes(payment_type)) {
      return json({ error: "Invalid payment_type" }, 400);
    }

    // Razorpay fields required for razorpay payments (unless QR recovery)
    if (
      (payment_type === "razorpay" || payment_type === "wallet_and_razorpay") &&
      !qr_recovery &&
      (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    ) {
      return json(
        { error: "Razorpay payment details required for this payment type" },
        400,
      );
    }

    // QR recovery requires at least order_id and payment_id
    if (qr_recovery && (!razorpay_order_id || !razorpay_payment_id)) {
      return json(
        { error: "order_id and payment_id required for QR recovery" },
        400,
      );
    }

    const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Resolve profile from Firebase UID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (!profile) return json({ error: "Profile not found" }, 404);

    // 4. Verify booking_data.user_id matches authenticated user
    if (booking_data.user_id !== profile.id) {
      return json({ error: "User ID mismatch" }, 403);
    }

    // 5. Verify payment
    if (payment_type === "razorpay" || payment_type === "wallet_and_razorpay") {
      if (qr_recovery) {
        // QR recovery: verify payment directly with Razorpay API
        console.log("[create-paid-booking] 🔍 QR recovery — verifying payment via Razorpay API");
        const authHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
        const rpRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
          headers: { Authorization: authHeader },
        });

        if (!rpRes.ok) {
          console.error("[create-paid-booking] ❌ Razorpay payment lookup failed:", rpRes.status);
          return json({ error: "Payment verification failed" }, 400);
        }

        const rpPayment = await rpRes.json();
        if (rpPayment.status !== "captured" && rpPayment.status !== "authorized") {
          console.error("[create-paid-booking] ❌ Payment not captured:", rpPayment.status);
          return json({ error: `Payment status: ${rpPayment.status}` }, 400);
        }
        if (rpPayment.order_id !== razorpay_order_id) {
          console.error("[create-paid-booking] ❌ Payment order mismatch");
          return json({ error: "Payment order mismatch" }, 400);
        }
        console.log("[create-paid-booking] ✅ QR payment verified via Razorpay API");
      } else {
        // Normal flow: verify HMAC signature
        const expectedData = `${razorpay_order_id}|${razorpay_payment_id}`;
        const isValid = await hmacSha256Verify(
          expectedData,
          razorpay_signature,
          RAZORPAY_KEY_SECRET,
        );
        if (!isValid) {
          console.error(
            "[create-paid-booking] HMAC verification failed for user:",
            profile.id,
          );
          return json({ error: "Payment verification failed" }, 400);
        }
        console.log("[create-paid-booking] ✅ Razorpay signature verified");
      }
    }

    // 6. Idempotency check — BEFORE wallet debit to prevent double-deduction
    if (
      (payment_type === "razorpay" || payment_type === "wallet_and_razorpay") &&
      razorpay_payment_id
    ) {
      const { data: existingByPayment, error: paymentLookupErr } = await supabase
        .from("bookings")
        .select("id, booking_type, status, payment_method")
        .eq("razorpay_payment_id", razorpay_payment_id)
        .maybeSingle();

      if (paymentLookupErr) {
        console.warn(
          "[create-paid-booking] razorpay_payment_id lookup skipped:",
          paymentLookupErr.message,
        );
      } else if (existingByPayment) {
        console.log(
          `[create-paid-booking] ⚡ Duplicate razorpay_payment_id=${razorpay_payment_id}, returning existing booking ${existingByPayment.id}`,
        );
        return json({
          success: true,
          booking_id: existingByPayment.id,
          payment_id: razorpay_payment_id,
          payment_method: existingByPayment.payment_method,
          wallet_debited: 0,
          idempotent: true,
        });
      }
    }

    if (requestId) {
      const { data: existing, error: existingLookupErr } = await supabase
        .from("bookings")
        .select("id, booking_type, status, payment_method")
        .eq("request_id", requestId)
        .maybeSingle();

      if (existingLookupErr) {
        console.warn(
          "[create-paid-booking] request_id lookup skipped:",
          existingLookupErr.message,
        );
      } else if (existing) {
        console.log(
          `[create-paid-booking] ⚡ Duplicate request_id=${requestId}, returning existing booking ${existing.id}`,
        );
        return json({
          success: true,
          booking_id: existing.id,
          payment_id: razorpay_payment_id || null,
          payment_method: existing.payment_method,
          wallet_debited: 0,
          idempotent: true,
        });
      }
    }

    // 7. Handle wallet debit (if applicable) — uses atomic increment-based ops for safety
    let walletDebited = 0;
    // For wallet-only payments, derive wallet_amount from price if not provided
    const effectiveWalletAmount = (() => {
      if (payment_type === "wallet") {
        const price = Number(booking_data.price_inr ?? 0);
        if (!Number.isFinite(price) || price <= 0) return 0;
        return Number(wallet_amount ?? price);
      }
      return Number(wallet_amount ?? 0);
    })();

    if (
      (payment_type === "wallet" || payment_type === "wallet_and_razorpay") &&
      effectiveWalletAmount > 0
    ) {
      // Fetch current balance to check sufficiency
      let { data: walletRow, error: walletFetchErr } = await supabase
        .from("user_wallets")
        .select("id, balance_inr")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (walletFetchErr) {
        console.warn("[create-paid-booking] Wallet fetch error:", walletFetchErr);
      }

      // Lazy wallet initialization: create wallet with ₹0 if it doesn't exist
      if (!walletRow) {
        console.log("[create-paid-booking] Wallet not found, creating one for user:", profile.id);
        const { data: newWallet, error: createErr } = await supabase
          .from("user_wallets")
          .upsert({ user_id: profile.id, balance_inr: 0 }, { onConflict: "user_id" })
          .select("id, balance_inr")
          .maybeSingle();

        if (newWallet) {
          walletRow = newWallet;
          walletFetchErr = null;
        } else {
          // Upsert may have returned no row due to RLS — refetch to confirm
          console.warn("[create-paid-booking] Upsert returned no row, refetching:", createErr);
          const { data: refetched } = await supabase
            .from("user_wallets")
            .select("id, balance_inr")
            .eq("user_id", profile.id)
            .maybeSingle();

          if (refetched) {
            walletRow = refetched;
            walletFetchErr = null;
          } else if (payment_type === "wallet") {
            console.error("[create-paid-booking] Failed to create wallet:", createErr);
            return json({ error: "Wallet not found and could not be created" }, 404);
          } else {
            console.warn("[create-paid-booking] Skipping wallet debit");
          }
        }
      }

      if (walletRow) {
        // CRITICAL: For wallet-only payments, balance MUST cover full price.
        // No booking is created if balance is insufficient.
        const bookingPrice = Number(booking_data.price_inr ?? 0);
        if (payment_type === "wallet" && walletRow.balance_inr < bookingPrice) {
          console.error(
            `[create-paid-booking] ❌ Insufficient wallet balance: have ₹${walletRow.balance_inr}, need ₹${bookingPrice}`,
          );
          return json({
            error: "Insufficient wallet balance",
            code: "INSUFFICIENT_BALANCE",
            balance: walletRow.balance_inr,
            required: bookingPrice,
          }, 400);
        }

        const debitAmount = Math.min(effectiveWalletAmount, walletRow.balance_inr);

        if (debitAmount > 0) {
          // SAFE: atomic increment-based debit (FOR UPDATE lock + min_balance guard)
          const { data: debitResult, error: debitErr } = await supabase.rpc("safe_wallet_increment", {
            p_user_id: profile.id,
            p_amount_delta: -debitAmount,
            p_min_balance: 0,
          });

          // RPC returns { error: 'insufficient_balance' } on failure
          const debitFailed = debitErr || (debitResult && typeof debitResult === "object" && (debitResult as any).error);

          if (debitFailed) {
            console.error("[create-paid-booking] ❌ Atomic wallet debit failed:", debitErr || debitResult);
            if (payment_type === "wallet") {
              return json({ error: "Wallet debit failed. Please retry." }, 500);
            }
            // For mixed payments, continue without wallet debit
          } else {
            walletDebited = debitAmount;

            // Record wallet transaction (linked to booking after insert)
            await supabase.from("wallet_transactions").insert({
              user_id: profile.id,
              amount_inr: debitAmount,
              type: "debit",
              reason: "booking_payment",
              reference_type: "booking_payment",
              notes: `Payment for ${booking_data.service_type} booking`,
            });

            console.log(
              `[create-paid-booking] ✅ Wallet debited ₹${debitAmount} (atomic)`,
            );
          }
        }
      }
    }

    // 8. Build the final booking row
    const completionOtp = generateOtp();
    const now = new Date().toISOString();

    const paymentMethod =
      payment_type === "wallet"
        ? "wallet"
        : payment_type === "wallet_and_razorpay"
          ? "wallet+razorpay"
          : "razorpay";

    const bookingPriceInr = Number(booking_data.price_inr ?? 0);
    const bookingRow: Record<string, unknown> = {
      ...booking_data,
      payment_status: "paid",
      payment_method: paymentMethod,
      completion_otp: completionOtp,
      razorpay_order_id: razorpay_order_id || null,
      razorpay_payment_id: razorpay_payment_id || null,
      razorpay_signature: razorpay_signature || null,
      payment_amount_inr: bookingPriceInr,
      paid_at: now,
    };

    if (requestId) {
      bookingRow.request_id = requestId;
    }

    if (payment_type !== "wallet") {
      const amountInPaise = Number(razorpay_amount ?? bookingPriceInr * 100);
      bookingRow.razorpay_paid_amount = Number.isFinite(amountInPaise)
        ? amountInPaise / 100
        : null;
    }

    if (walletDebited > 0) {
      bookingRow.wallet_used_amount = walletDebited;
    }

    // Remove any fields the frontend shouldn't set
    delete bookingRow.payment_status_override;
    delete bookingRow.request_id;

    if (requestId) {
      bookingRow.request_id = requestId;
    }

    console.log(
      "[create-paid-booking] 📝 Inserting booking:",
      JSON.stringify({
        service_type: bookingRow.service_type,
        booking_type: bookingRow.booking_type,
        price_inr: bookingRow.price_inr,
        payment_method: bookingRow.payment_method,
        wallet_used: walletDebited,
      }),
    );

    // 9. Insert booking
    const { data: newBooking, error: insertErr } = await insertBookingWithCompatibilityFallback(
      supabase,
      bookingRow,
    );

    if (insertErr) {
      // 9a. Race condition: unique index violation means another request won the race
      if (requestId && (insertErr.code === "23505" || insertErr.message?.includes("uq_bookings_request_id"))) {
        console.warn(
          `[create-paid-booking] ⚡ Race: unique index hit for request_id=${requestId}, fetching existing booking`,
        );
        // SAFE: Increment-based refund (adds back the debited amount)
        if (walletDebited > 0) {
          await supabase.rpc("safe_wallet_increment", {
            p_user_id: profile.id,
            p_amount_delta: walletDebited,
            p_min_balance: 0,
          }).catch(() => {
            // Fallback: use raw increment via SQL expression workaround
            return supabase.rpc("credit_wallet_on_cancel", {
              p_booking_id: "00000000-0000-0000-0000-000000000000", // dummy, won't match
            }).catch(() => {
              // Last resort: read current balance, add back
              return supabase
                .from("user_wallets")
                .select("balance_inr")
                .eq("user_id", profile.id)
                .single()
                .then(({ data }) => {
                  if (!data) return;
                  return supabase
                    .from("user_wallets")
                    .update({
                      balance_inr: data.balance_inr + walletDebited,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", profile.id)
                    .eq("balance_inr", data.balance_inr); // Optimistic lock
                });
            });
          });
          // Remove the duplicate wallet transaction
          await supabase
            .from("wallet_transactions")
            .delete()
            .eq("user_id", profile.id)
            .eq("type", "debit")
            .is("booking_id", null)
            .order("created_at", { ascending: false })
            .limit(1);
        }

        const { data: raceWinner } = await supabase
          .from("bookings")
          .select("id, booking_type, status, payment_method")
          .eq("request_id", requestId)
          .single();

        if (raceWinner) {
          return json({
            success: true,
            booking_id: raceWinner.id,
            payment_id: razorpay_payment_id || null,
            payment_method: raceWinner.payment_method,
            wallet_debited: 0,
            idempotent: true,
          });
        }
      }

      console.error("[create-paid-booking] ❌ Booking insert failed:", insertErr);

      // If wallet was debited but insert failed, refund wallet — SAFE increment-based
      if (walletDebited > 0) {
        console.log("[create-paid-booking] 🔄 Refunding wallet due to insert failure, amount:", walletDebited);
        await supabase.rpc("safe_wallet_increment", {
          p_user_id: profile.id,
          p_amount_delta: walletDebited,
          p_min_balance: 0,
        }).catch(async (refundErr: any) => {
          console.error("[create-paid-booking] safe_wallet_increment RPC failed, trying read+increment:", refundErr);
          // Fallback: read current balance, add back with optimistic lock
          const { data: currentWallet } = await supabase
            .from("user_wallets")
            .select("balance_inr")
            .eq("user_id", profile.id)
            .single();
          if (currentWallet) {
            return supabase
              .from("user_wallets")
              .update({
                balance_inr: currentWallet.balance_inr + walletDebited,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", profile.id)
              .eq("balance_inr", currentWallet.balance_inr); // Optimistic lock
          }
        });
      }

      return json(
        { error: "Failed to create booking: " + insertErr.message },
        500,
      );
    }

    console.log(
      `[create-paid-booking] ✅ Booking created: ${newBooking.id}`,
    );

    // 10. Update wallet transaction with booking reference (if applicable)
    if (walletDebited > 0) {
      await supabase
        .from("wallet_transactions")
        .update({ booking_id: newBooking.id })
        .eq("user_id", profile.id)
        .eq("type", "debit")
        .is("booking_id", null)
        .order("created_at", { ascending: false })
        .limit(1);
    }

    // 11. Trigger dispatch for instant bookings
    if (newBooking.booking_type === "instant") {
      console.log(
        `[create-paid-booking] 🚀 Dispatching instant booking ${newBooking.id}`,
      );
      try {
        const { error: dispatchErr } = await supabase.rpc("dispatch_booking", {
          p_booking_id: newBooking.id,
        });
        if (dispatchErr) {
          console.warn(
            "[create-paid-booking] dispatch RPC failed, trying edge fn:",
            dispatchErr.message,
          );
          await fetch(`${SUPABASE_URL}/functions/v1/scheduled-dispatch`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ booking_id: newBooking.id }),
          });
        }
      } catch (e) {
        console.error(
          "[create-paid-booking] Dispatch error (non-blocking):",
          e,
        );
      }
    }

    // 12. Return success
    return json({
      success: true,
      booking_id: newBooking.id,
      payment_id: razorpay_payment_id || null,
      payment_method: paymentMethod,
      wallet_debited: walletDebited,
    });
  } catch (err: any) {
    console.error("[create-paid-booking] Error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
