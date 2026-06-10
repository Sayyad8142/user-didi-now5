/**
 * Shared helper used by razorpay-webhook and reconcile-pending-bookings
 * to atomically create a booking from a `pending_bookings` row after a
 * successful Razorpay payment, when the frontend `create-paid-booking`
 * call never landed.
 *
 * Idempotency rules (in order):
 *   1. If a booking already exists for razorpay_payment_id → reuse it.
 *   2. If a booking already exists for request_id          → reuse it.
 *   3. Otherwise insert a new booking with payment_status='paid'.
 *
 * On any final failure with a captured Razorpay payment we MUST NOT
 * silently swallow it — we log an orphan_payments row tagged
 * 'manual_review' so ops can fix it.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPTIONAL_BOOKING_INSERT_COLUMNS = new Set([
  "completion_otp",
  "paid_at",
  "payment_amount_inr",
  "razorpay_paid_amount",
  "request_id",
  "wallet_used_amount",
  "building_id",
  "community_id",
  "flat_id",
  "preferred_worker_id",
  "dish_intensity",
  "dish_intensity_extra_inr",
  "has_glass_partition",
  "glass_partition_fee",
  "surcharge_amount",
  "surcharge_reason",
]);

function extractMissingColumnName(message?: string): string | null {
  if (!message) return null;
  const patterns = [
    /Could not find the '([^']+)' column of 'bookings' in the schema cache/i,
    /column(?:\s+"|\s+)([^"\s]+)(?:"|\s+)of relation(?:\s+"|\s+)bookings(?:"|\s+)does not exist/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function insertBookingWithCompat(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
) {
  const current = { ...row };
  let lastErr: any = null;
  for (let i = 0; i <= OPTIONAL_BOOKING_INSERT_COLUMNS.size; i++) {
    const res = await supabase
      .from("bookings")
      .insert([current])
      .select("id, booking_type, status")
      .single();
    if (!res.error) return res;
    lastErr = res.error;
    const missing = extractMissingColumnName(res.error.message);
    if (
      !missing ||
      !OPTIONAL_BOOKING_INSERT_COLUMNS.has(missing) ||
      !(missing in current)
    ) return res;
    delete current[missing];
  }
  return { data: null, error: lastErr };
}

function generateOtp(): string {
  return String(Math.floor(100 + Math.random() * 900));
}

export interface PendingBookingRow {
  razorpay_order_id: string;
  user_id: string;
  request_id: string;
  booking_data: Record<string, unknown>;
  payment_type: string;
  wallet_amount: number | null;
  amount_inr: number | null;
  status: string;
  booking_id: string | null;
}

export interface CreateFromPendingArgs {
  supabase: SupabaseClient;
  pending: PendingBookingRow;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_amount_paise?: number;
  webhook_payload?: unknown;
  source: "webhook" | "reconcile";
}

export interface CreateFromPendingResult {
  status: "created" | "already_exists" | "consumed" | "failed_logged_for_review" | "retry_later";
  booking_id?: string;
  error?: string;
}

export async function createBookingFromPending(
  args: CreateFromPendingArgs,
): Promise<CreateFromPendingResult> {
  const { supabase, pending, razorpay_payment_id, razorpay_order_id, source } = args;
  const tag = `[bookingFromPending:${source}]`;

  // 1. Already linked?
  if (pending.booking_id) {
    return { status: "already_exists", booking_id: pending.booking_id };
  }

  // 2. Idempotency lookups
  const { data: byPayment } = await supabase
    .from("bookings")
    .select("id")
    .eq("razorpay_payment_id", razorpay_payment_id)
    .maybeSingle();
  if (byPayment?.id) {
    await markConsumed(supabase, pending.razorpay_order_id, byPayment.id);
    return { status: "already_exists", booking_id: byPayment.id };
  }

  if (pending.request_id) {
    const { data: byReq } = await supabase
      .from("bookings")
      .select("id")
      .eq("request_id", pending.request_id)
      .maybeSingle();
    if (byReq?.id) {
      await markConsumed(supabase, pending.razorpay_order_id, byReq.id);
      return { status: "already_exists", booking_id: byReq.id };
    }
  }

  // 3. Wallet debit (if pending payment_type includes wallet)
  const walletAmount = Number(pending.wallet_amount ?? 0);
  let walletDebited = 0;
  if (
    walletAmount > 0 &&
    (pending.payment_type === "wallet_and_razorpay" ||
      pending.payment_type === "wallet")
  ) {
    const { data: debitResult, error: debitErr } = await supabase.rpc(
      "safe_wallet_increment",
      {
        p_user_id: pending.user_id,
        p_amount_delta: -walletAmount,
        p_min_balance: 0,
      },
    );
    const failed =
      debitErr ||
      (debitResult && typeof debitResult === "object" && (debitResult as any).error);
    if (failed) {
      console.warn(
        `${tag} wallet debit skipped order=${razorpay_order_id} reason=${
          debitErr?.message || (debitResult as any)?.error
        }`,
      );
      // Continue — Razorpay portion is real money; record orphan if booking ultimately fails.
    } else {
      walletDebited = walletAmount;
      await supabase.from("wallet_transactions").insert({
        user_id: pending.user_id,
        amount_inr: walletAmount,
        type: "debit",
        reason: "booking_payment",
        reference_type: "booking_payment",
        notes: `Payment for booking (recovered via ${source})`,
      });
    }
  }

  // 4. Build row
  const now = new Date().toISOString();
  const paymentMethod =
    pending.payment_type === "wallet"
      ? "wallet"
      : pending.payment_type === "wallet_and_razorpay"
        ? "wallet+razorpay"
        : "razorpay";

  const bookingPriceInr = Number(
    (pending.booking_data as any).price_inr ?? pending.amount_inr ?? 0,
  );

  const bookingRow: Record<string, unknown> = {
    ...pending.booking_data,
    user_id: pending.user_id,
    payment_status: "paid",
    payment_method: paymentMethod,
    completion_otp: generateOtp(),
    razorpay_order_id,
    razorpay_payment_id,
    payment_amount_inr: bookingPriceInr,
    paid_at: now,
    request_id: pending.request_id,
  };
  if (pending.payment_type !== "wallet" && args.razorpay_amount_paise) {
    bookingRow.razorpay_paid_amount = args.razorpay_amount_paise / 100;
  }
  if (walletDebited > 0) bookingRow.wallet_used_amount = walletDebited;

  console.log(
    `${tag} inserting booking order=${razorpay_order_id} payment=${razorpay_payment_id} req=${pending.request_id}`,
  );

  // 5. Insert
  const { data: inserted, error: insertErr } = await insertBookingWithCompat(
    supabase,
    bookingRow,
  );

  if (insertErr) {
    // Race: unique constraint on request_id or payment_id — fetch the winner
    if (
      (insertErr as any).code === "23505" ||
      /uq_bookings_request_id|razorpay_payment_id/i.test(
        (insertErr as any).message || "",
      )
    ) {
      const { data: winner } = await supabase
        .from("bookings")
        .select("id")
        .or(
          `razorpay_payment_id.eq.${razorpay_payment_id},request_id.eq.${pending.request_id}`,
        )
        .maybeSingle();
      if (winner?.id) {
        // Refund the wallet debit we just made (race winner already debited).
        if (walletDebited > 0) {
          try {
            await supabase.rpc("safe_wallet_increment", {
              p_user_id: pending.user_id,
              p_amount_delta: walletDebited,
              p_min_balance: 0,
            });
          } catch (e) {
            console.error(`${tag} race refund failed:`, e);
          }
        }
        await markConsumed(supabase, pending.razorpay_order_id, winner.id);
        return { status: "already_exists", booking_id: winner.id };
      }
    }

    // ── P0: SUPPLY_FULL with a captured payment is NOT a terminal failure.
    // Refund any wallet debit from this attempt, keep the pending row
    // retryable, and let the reconcile cron retry once supply frees up.
    if (/SUPPLY_FULL/i.test((insertErr as any).message || "")) {
      console.warn(
        `${tag} POST_PAYMENT_SUPPLY_REJECTION order=${razorpay_order_id} payment=${razorpay_payment_id} — will retry via reconcile cron`,
      );
      if (walletDebited > 0) {
        try {
          await supabase.rpc("safe_wallet_increment", {
            p_user_id: pending.user_id,
            p_amount_delta: walletDebited,
            p_min_balance: 0,
          });
        } catch (e) {
          console.error(`${tag} supply-retry wallet refund failed:`, e);
        }
      }
      try {
        await supabase
          .from("pending_bookings")
          .update({
            status: "awaiting_payment",
            last_error: `POST_PAYMENT_SUPPLY_REJECTION: ${(insertErr as any).message}`,
            last_checked_at: now,
          })
          .eq("razorpay_order_id", pending.razorpay_order_id);
      } catch (e) {
        console.error(`${tag} supply-retry pending update failed:`, e);
      }
      return { status: "retry_later", error: (insertErr as any).message };
    }

    console.error(
      `${tag} ❌ insert failed order=${razorpay_order_id} payment=${razorpay_payment_id}:`,
      insertErr,
    );

    // Money was captured but we can't create the booking → log for manual review.
    try {
      await supabase.from("orphan_payments").upsert(
        {
          razorpay_payment_id,
          razorpay_order_id,
          amount_inr: (args.razorpay_amount_paise ?? 0) / 100 || bookingPriceInr,
          user_id: pending.user_id,
          status: "manual_review",
          notes: `Booking insert failed in ${source}: ${insertErr.message}`,
          webhook_payload: args.webhook_payload ?? null,
        },
        { onConflict: "razorpay_payment_id" } as any,
      );
    } catch (e) {
      console.error(`${tag} orphan_payments upsert failed:`, e);
    }

    // Refund wallet so the customer is not double-charged in money + wallet.
    if (walletDebited > 0) {
      try {
        await supabase.rpc("safe_wallet_increment", {
          p_user_id: pending.user_id,
          p_amount_delta: walletDebited,
          p_min_balance: 0,
        });
      } catch (e) {
        console.error(`${tag} wallet refund failed:`, e);
      }
    }


    await supabase
      .from("pending_bookings")
      .update({
        status: "manual_review",
        last_error: insertErr.message,
        last_checked_at: now,
      })
      .eq("razorpay_order_id", pending.razorpay_order_id);

    return { status: "failed_logged_for_review", error: insertErr.message };
  }

  const bookingId = inserted!.id as string;

  // 6. Mark pending consumed + link wallet txn
  await markConsumed(supabase, pending.razorpay_order_id, bookingId);
  if (walletDebited > 0) {
    await supabase
      .from("wallet_transactions")
      .update({ booking_id: bookingId })
      .eq("user_id", pending.user_id)
      .eq("type", "debit")
      .is("booking_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
  }

  console.log(
    `${tag} ✅ recovered booking=${bookingId} order=${razorpay_order_id} payment=${razorpay_payment_id}`,
  );

  return { status: "created", booking_id: bookingId };
}

async function markConsumed(
  supabase: SupabaseClient,
  orderId: string,
  bookingId: string,
) {
  await supabase
    .from("pending_bookings")
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
      booking_id: bookingId,
    })
    .eq("razorpay_order_id", orderId);
}

export async function fetchPendingByOrderId(
  supabase: SupabaseClient,
  orderId: string,
): Promise<PendingBookingRow | null> {
  const { data, error } = await supabase
    .from("pending_bookings")
    .select(
      "razorpay_order_id, user_id, request_id, booking_data, payment_type, wallet_amount, amount_inr, status, booking_id",
    )
    .eq("razorpay_order_id", orderId)
    .maybeSingle();
  if (error) {
    console.warn("[pending_bookings] fetch error:", error.message);
    return null;
  }
  return (data as PendingBookingRow | null) ?? null;
}
