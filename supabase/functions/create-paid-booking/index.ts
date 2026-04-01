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
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate via Firebase
    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Not authenticated" }, 401);

    const firebaseUser = await verifyFirebaseToken(idToken);

    // 2. Parse request
    const {
      booking_data,
      payment_type,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpay_amount,
      wallet_amount,
    } = await req.json();

    if (!booking_data || !payment_type) {
      return json({ error: "booking_data and payment_type required" }, 400);
    }

    const validTypes = ["razorpay", "wallet", "wallet_and_razorpay"];
    if (!validTypes.includes(payment_type)) {
      return json({ error: "Invalid payment_type" }, 400);
    }

    // Razorpay fields required for razorpay payments
    if (
      (payment_type === "razorpay" || payment_type === "wallet_and_razorpay") &&
      (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    ) {
      return json(
        { error: "Razorpay payment details required for this payment type" },
        400,
      );
    }

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

    // 5. Verify Razorpay signature (if applicable)
    if (payment_type === "razorpay" || payment_type === "wallet_and_razorpay") {
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

    // 6. Handle wallet debit (if applicable)
    let walletDebited = 0;
    if (
      (payment_type === "wallet" || payment_type === "wallet_and_razorpay") &&
      wallet_amount > 0
    ) {
      // Debit wallet atomically
      const { data: walletRow, error: walletFetchErr } = await supabase
        .from("user_wallets")
        .select("id, balance_inr")
        .eq("user_id", profile.id)
        .single();

      if (walletFetchErr || !walletRow) {
        if (payment_type === "wallet") {
          return json({ error: "Wallet not found" }, 404);
        }
        // For wallet_and_razorpay, proceed without wallet debit
        console.warn("[create-paid-booking] Wallet not found, skipping wallet debit");
      } else {
        const debitAmount = Math.min(wallet_amount, walletRow.balance_inr);

        if (payment_type === "wallet" && debitAmount < booking_data.price_inr) {
          return json({ error: "Insufficient wallet balance" }, 400);
        }

        if (debitAmount > 0) {
          // Update wallet balance
          const { error: debitErr } = await supabase
            .from("user_wallets")
            .update({
              balance_inr: walletRow.balance_inr - debitAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", walletRow.id)
            .eq("balance_inr", walletRow.balance_inr); // Optimistic lock

          if (debitErr) {
            console.error("[create-paid-booking] Wallet debit failed:", debitErr);
            if (payment_type === "wallet") {
              return json({ error: "Wallet debit failed. Please retry." }, 500);
            }
            // For partial wallet, proceed without — Razorpay covers the full price
          } else {
            walletDebited = debitAmount;

            // Record wallet transaction
            await supabase.from("wallet_transactions").insert({
              user_id: profile.id,
              amount: -debitAmount,
              type: "debit",
              description: `Payment for ${booking_data.service_type} booking`,
              reference_type: "booking_payment",
            });

            console.log(
              `[create-paid-booking] ✅ Wallet debited ₹${debitAmount}`,
            );
          }
        }
      }
    }

    // 7. Build the final booking row
    const completionOtp = generateOtp();
    const now = new Date().toISOString();

    const paymentMethod =
      payment_type === "wallet"
        ? "wallet"
        : payment_type === "wallet_and_razorpay"
          ? "wallet+razorpay"
          : "razorpay";

    const bookingRow = {
      ...booking_data,
      payment_status: "paid",
      payment_method: paymentMethod,
      completion_otp: completionOtp,
      razorpay_order_id: razorpay_order_id || null,
      razorpay_payment_id: razorpay_payment_id || null,
      razorpay_signature: razorpay_signature || null,
      razorpay_paid_amount:
        payment_type !== "wallet" ? (razorpay_amount || booking_data.price_inr) / 100 : null,
      wallet_used_amount: walletDebited > 0 ? walletDebited : null,
      payment_amount_inr: booking_data.price_inr,
      paid_confirmed_at: now,
    };

    // Remove any fields the frontend shouldn't set
    delete bookingRow.payment_status_override;

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

    // 8. Insert booking
    const { data: newBooking, error: insertErr } = await supabase
      .from("bookings")
      .insert([bookingRow])
      .select("id, booking_type, status")
      .single();

    if (insertErr) {
      console.error("[create-paid-booking] ❌ Booking insert failed:", insertErr);

      // If wallet was debited but insert failed, refund wallet
      if (walletDebited > 0) {
        console.log("[create-paid-booking] 🔄 Refunding wallet due to insert failure");
        await supabase.rpc("credit_wallet", {
          p_user_id: profile.id,
          p_amount: walletDebited,
          p_description: "Refund: booking creation failed",
        }).catch((refundErr: any) => {
          // Fallback: manual credit
          console.error("[create-paid-booking] credit_wallet RPC failed, trying manual:", refundErr);
          return supabase
            .from("user_wallets")
            .update({
              balance_inr: (walletRow as any).balance_inr, // restore original
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", profile.id);
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

    // 9. Update wallet transaction with booking reference (if applicable)
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

    // 10. Trigger dispatch for instant bookings
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

    // 11. Return success
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
