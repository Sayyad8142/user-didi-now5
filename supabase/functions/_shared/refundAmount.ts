// Single authoritative source for "how much was actually charged" and for
// crediting cancellation refunds back to the wallet.
//
// IMPORTANT: refunds must NEVER be recalculated from base_price_inr, current
// slot surge/discount rules, service pricing or anything the admin can change
// later. We only read the immutable amounts persisted when the booking was paid.

export interface BookingAmountRow {
  price_inr?: number | null;
  payment_amount_inr?: number | null;
  razorpay_paid_amount?: number | null;
  wallet_used_amount?: number | null;
  base_price_inr?: number | null;
  payment_status?: string | null;
  wallet_refund_status?: string | null;
  wallet_refund_amount?: number | null;
  otp_verified_at?: string | null;
}

/** Columns needed by resolvePaidAmountInr — keep in sync. */
export const PAID_AMOUNT_COLUMNS =
  "price_inr, payment_amount_inr, razorpay_paid_amount, wallet_used_amount, payment_status, wallet_refund_status, wallet_refund_amount, otp_verified_at";

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The exact amount successfully captured for this booking, in INR.
 * Priority:
 *  1. wallet_used_amount + razorpay_paid_amount (what actually left the user)
 *  2. payment_amount_inr (amount charged, snapshotted at payment time)
 *  3. price_inr (final price incl. surge/discount, snapshotted on the booking)
 * base_price_inr is deliberately never used.
 */
export function resolvePaidAmountInr(booking: BookingAmountRow): number {
  const captured = num(booking.wallet_used_amount) + num(booking.razorpay_paid_amount);
  if (captured > 0) return Math.round(captured * 100) / 100;

  const charged = num(booking.payment_amount_inr);
  if (charged > 0) return charged;

  return num(booking.price_inr);
}

/**
 * Ground truth: the exact amount actually debited for this booking.
 * Sums wallet debits recorded in wallet_transactions (excluding refund
 * corrections) plus any Razorpay capture on the booking. This is authoritative
 * over booking snapshot columns, which can carry the pre-discount price.
 */
export async function resolveActualDebitedInr(
  admin: any,
  bookingId: string,
  booking: BookingAmountRow,
): Promise<number> {
  let walletDebited = 0;
  try {
    const { data: debits } = await admin
      .from("wallet_transactions")
      .select("amount_inr, reason")
      .eq("booking_id", bookingId)
      .eq("type", "debit");

    walletDebited = (debits || [])
      .filter((r: any) => String(r.reason ?? "") !== "refund_correction")
      .reduce((s: number, r: any) => s + num(r.amount_inr), 0);
  } catch (_e) {
    walletDebited = 0;
  }

  const total = walletDebited + num(booking.razorpay_paid_amount);
  if (total > 0) return Math.round(total * 100) / 100;

  // No ledger rows found — fall back to the booking snapshot.
  return resolvePaidAmountInr(booking);
}


export interface RefundResult {
  refunded?: boolean;
  skipped?: boolean;
  reason?: string;
  paid_amount?: number;
  already_credited?: number;
  refund_amount?: number;
  error?: string;
}

/**
 * Idempotently credit the cancellation refund to the user's wallet.
 * Safe to call after a DB trigger/RPC already refunded: it only tops up the
 * difference between the authoritative paid amount and what was credited.
 */
export async function refundBookingToWallet(
  admin: any,
  bookingId: string,
  userId: string,
  reason = "user_cancelled",
  refundPercent = 1,
  cancellationFee = 0,
): Promise<RefundResult> {
  // Preferred path: fully atomic, race-safe DB RPC (advisory lock + row locks).
  // Falls back to the TS reconciliation below when the RPC isn't deployed yet.
  if (refundPercent === 1 && cancellationFee === 0) {
    try {
      const { data: rpcRes, error: rpcErr } = await admin.rpc("refund_booking_actual_paid", {
        p_booking_id: bookingId,
        p_reason: reason,
      });
      if (!rpcErr && rpcRes && typeof rpcRes === "object" && !(rpcRes as any).error) {
        return rpcRes as RefundResult;
      }
      if (rpcErr) {
        console.warn("[refundBookingToWallet] RPC unavailable, using fallback:", rpcErr.message);
      }
    } catch (e) {
      console.warn("[refundBookingToWallet] RPC threw, using fallback:", (e as Error).message);
    }
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select(PAID_AMOUNT_COLUMNS)
    .eq("id", bookingId)
    .maybeSingle();


  if (error) return { error: error.message };
  if (!booking) return { error: "booking_not_found" };
  if (booking.otp_verified_at) return { skipped: true, reason: "otp_verified" };
  if (!["paid", "moved_to_wallet"].includes(String(booking.payment_status))) {
    return { skipped: true, reason: "booking_not_paid" };
  }

  const paid = await resolveActualDebitedInr(admin, bookingId, booking as BookingAmountRow);
  if (!(paid > 0)) return { skipped: true, reason: "zero_amount" };

  const eligible = Math.max(0, Math.round((paid * refundPercent - cancellationFee) * 100) / 100);
  if (!(eligible > 0)) return { skipped: true, reason: "not_refundable", paid_amount: paid };

  // Net already refunded = refund credits minus any refund_correction debits.
  const { data: credits } = await admin
    .from("wallet_transactions")
    .select("amount_inr")
    .eq("booking_id", bookingId)
    .eq("type", "credit");

  const { data: corrections } = await admin
    .from("wallet_transactions")
    .select("amount_inr")
    .eq("booking_id", bookingId)
    .eq("type", "debit")
    .eq("reason", "refund_correction");

  const sum = (rows: any[] | null) =>
    (rows || []).reduce((s: number, r: any) => s + Number(r.amount_inr ?? 0), 0);

  const alreadyCredited = Math.round((sum(credits) - sum(corrections)) * 100) / 100;

  const delta = Math.round((eligible - alreadyCredited) * 100) / 100;


  // Over-refunded (e.g. a DB trigger credited the base price instead of the
  // discounted amount actually paid) — claw the excess back so the wallet
  // reflects exactly what the customer paid.
  if (delta <= -0.5) {
    const excess = Math.abs(delta);
    const { error: decError } = await admin.rpc("safe_wallet_increment", {
      p_user_id: userId,
      p_amount_delta: -excess,
    });
    if (decError) {
      console.error("[refundBookingToWallet] over-refund correction failed", decError);
      return { error: decError.message, paid_amount: paid, already_credited: alreadyCredited };
    }
    await admin.from("wallet_transactions").insert({
      user_id: userId,
      booking_id: bookingId,
      type: "debit",
      amount_inr: excess,
      reason: "refund_correction",
      reference_type: "booking_refund",
      notes: `Refund corrected to amount actually paid (₹${eligible})`,
    });
    await admin
      .from("bookings")
      .update({
        wallet_refund_status: "credited",
        wallet_refund_amount: eligible,
        wallet_refund_reason: reason,
      })
      .eq("id", bookingId);
    return {
      refunded: true,
      paid_amount: paid,
      already_credited: alreadyCredited,
      refund_amount: eligible,
      reason: "over_refund_corrected",
    };
  }

  if (delta <= 0.5) {
    return {
      skipped: true,
      reason: alreadyCredited > 0 ? "already_refunded" : "nothing_due",
      paid_amount: paid,
      already_credited: alreadyCredited,
      refund_amount: alreadyCredited,
    };
  }

  const { error: incError } = await admin.rpc("safe_wallet_increment", {
    p_user_id: userId,
    p_amount_delta: delta,
  });
  if (incError) {
    console.error("[refundBookingToWallet] increment failed", incError);
    return { error: incError.message, paid_amount: paid };
  }

  await admin.from("wallet_transactions").insert({
    user_id: userId,
    booking_id: bookingId,
    type: "credit",
    amount_inr: delta,
    reason,
    reference_type: "booking_refund",
    notes: alreadyCredited > 0
      ? `Refund adjustment for cancelled booking (paid ₹${paid})`
      : `Refund for cancelled booking (paid ₹${paid})`,
  });

  await admin
    .from("bookings")
    .update({
      wallet_refund_status: "credited",
      wallet_refund_amount: eligible,
      wallet_refund_reason: reason,
    })
    .eq("id", bookingId);

  return {
    refunded: true,
    paid_amount: paid,
    already_credited: alreadyCredited,
    refund_amount: eligible,
  };
}
