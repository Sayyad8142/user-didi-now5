// Single authoritative source for "how much was actually charged" and for
// crediting cancellation refunds back to the wallet.
//
// IMPORTANT: refunds must NEVER be recalculated from base_price_inr, current
// slot surge/discount rules, service pricing or anything the admin can change
// later. We only read the immutable amounts persisted when the booking was paid.
//
// The production (external) database does NOT have every optional payment
// column — e.g. payment_amount_inr / wallet_used_amount / razorpay_paid_amount /
// wallet_refund_* are absent in production, while price_inr, base_price_inr,
// surcharge_amount, loyalty_surcharge_inr, slot_surge_amount exist. A fixed
// column list therefore made the whole SELECT fail with
// "column bookings.payment_amount_inr does not exist" and the resolver never
// refunded anything (only the DB trigger did, crediting whatever it decided).
// Everything below is schema-adaptive: it reads the row with `*` and uses
// whichever amount columns are present.

export interface BookingAmountRow {
  price_inr?: number | null;
  payment_amount_inr?: number | null;
  razorpay_paid_amount?: number | null;
  wallet_used_amount?: number | null;
  base_price_inr?: number | null;
  surcharge_amount?: number | null;
  slot_surge_amount?: number | null;
  loyalty_surcharge_inr?: number | null;
  loyalty_surge_amount?: number | null;
  dish_intensity_extra_inr?: number | null;
  glass_partition_fee?: number | null;
  discount_inr?: number | null;
  payment_status?: string | null;
  wallet_refund_status?: string | null;
  wallet_refund_amount?: number | null;
  otp_verified_at?: string | null;
  [key: string]: unknown;
}

/** Kept for backwards compatibility — the resolver now reads `*`. */
export const PAID_AMOUNT_COLUMNS = "*";

/** Payment states that represent money actually collected from the customer. */
const PAID_STATUSES = ["paid", "moved_to_wallet", "refunded_to_wallet", "partially_refunded"];

export function isPaidStatus(status?: string | null): boolean {
  return PAID_STATUSES.includes(String(status ?? ""));
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The exact amount successfully captured for this booking, in INR.
 * Priority:
 *  1. wallet_used_amount + razorpay_paid_amount (what actually left the user)
 *  2. payment_amount_inr (amount charged, snapshotted at payment time)
 *  3. price_inr (final price incl. every surcharge/search fee/surge and
 *     discount, snapshotted on the booking when it was paid)
 *  4. base_price_inr + every surcharge component - discount (only when
 *     price_inr is missing)
 * base_price_inr alone is deliberately never used: it excludes the search
 * fee / surge components the customer actually paid.
 */
export function resolvePaidAmountInr(booking: BookingAmountRow): number {
  const captured = num(booking.wallet_used_amount) + num(booking.razorpay_paid_amount);
  if (captured > 0) return round2(captured);

  const charged = num(booking.payment_amount_inr);
  if (charged > 0) return charged;

  const price = num(booking.price_inr);
  if (price > 0) return price;

  const composed =
    num(booking.base_price_inr) +
    num(booking.surcharge_amount) +
    num(booking.slot_surge_amount) +
    num(booking.loyalty_surcharge_inr) +
    num(booking.loyalty_surge_amount) +
    num(booking.dish_intensity_extra_inr) +
    num(booking.glass_partition_fee) -
    num(booking.discount_inr);
  return Math.max(0, round2(composed));
}

/**
 * Ground truth: the exact amount actually debited for this booking.
 * Sums wallet debits recorded in wallet_transactions (excluding refund
 * corrections) plus any Razorpay capture on the booking. Falls back to the
 * booking snapshot when no ledger debit rows exist (production does not log a
 * wallet debit row for every booking payment).
 *
 * The snapshot value is also used as a floor: if the logged debit is smaller
 * than the price actually charged (e.g. only part of the payment was logged),
 * we trust the larger authoritative snapshot so surcharges/search fees are
 * never dropped from the refund.
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
      .filter((r: any) => {
        const reason = String(r.reason ?? "");
        // Exclude our own corrections and admin-side manual adjustments —
        // they are not part of what the customer paid for this booking.
        return reason !== "refund_correction" && reason !== "admin_manual_debit";
      })
      .reduce((s: number, r: any) => s + num(r.amount_inr), 0);
  } catch (_e) {
    walletDebited = 0;
  }

  const ledgerTotal = round2(walletDebited + num(booking.razorpay_paid_amount));
  const snapshot = resolvePaidAmountInr(booking);
  return Math.max(ledgerTotal, snapshot);
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
 * Insert a wallet ledger row. Drops optional columns the schema lacks and, if a
 * unique index already holds a row for (booking, type, reason), retries with an
 * alternative reason so a legitimate top-up is always recorded. A missing
 * ledger row is fatal: without it the next call would re-credit the same money.
 */
async function insertWalletTx(
  admin: any,
  row: Record<string, unknown>,
  optional: Record<string, unknown>,
  altReasons: string[] = [],
) {
  const reasons = [String(row.reason ?? ""), ...altReasons];
  for (const reason of reasons) {
    const base = { ...row, reason };
    for (const payload of [{ ...base, ...optional }, base]) {
      const { error } = await admin.from("wallet_transactions").insert(payload);
      if (!error) return true;
      console.warn("[refundBookingToWallet] ledger insert failed", error.code, error.message);
      if (["42703", "PGRST204"].includes(String(error.code))) continue; // drop optional cols
      break; // constraint/other error — try the next reason
    }
  }
  return false;
}


/** Persist refund bookkeeping on the booking, ignoring absent columns. */
async function markBookingRefunded(
  admin: any,
  bookingId: string,
  amount: number,
  reason: string,
) {
  const attempts: Record<string, unknown>[] = [
    { wallet_refund_status: "credited", wallet_refund_amount: amount, wallet_refund_reason: reason },
    { wallet_refund_status: "credited", wallet_refund_amount: amount },
    { payment_status: "refunded_to_wallet" },
  ];
  for (const payload of attempts) {
    const { error } = await admin.from("bookings").update(payload).eq("id", bookingId);
    if (!error) return;
    if (!["42703", "PGRST204"].includes(String(error.code))) return;
  }
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
  // Falls back to the TS reconciliation below when the RPC isn't deployed.
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
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!booking) return { error: "booking_not_found" };
  if (booking.otp_verified_at) return { skipped: true, reason: "otp_verified" };
  if (!isPaidStatus(booking.payment_status)) {
    return { skipped: true, reason: "booking_not_paid" };
  }

  const paid = await resolveActualDebitedInr(admin, bookingId, booking as BookingAmountRow);
  if (!(paid > 0)) return { skipped: true, reason: "zero_amount" };

  const eligible = Math.max(0, round2(paid * refundPercent - cancellationFee));
  if (!(eligible > 0)) return { skipped: true, reason: "not_refundable", paid_amount: paid };

  // Net already refunded = refund credits minus any refund_correction debits.
  const { data: credits } = await admin
    .from("wallet_transactions")
    .select("amount_inr, reason")
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

  const alreadyCredited = round2(sum(credits) - sum(corrections));
  const delta = round2(eligible - alreadyCredited);

  // Over-refunded (e.g. a DB trigger credited more than the amount actually
  // paid) — claw the excess back so the wallet reflects exactly what was paid.
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
    await insertWalletTx(
      admin,
      {
        user_id: userId,
        booking_id: bookingId,
        type: "debit",
        amount_inr: excess,
        reason: "refund_correction",
      },
      {
        reference_type: "booking_refund",
        notes: `Refund corrected to amount actually paid (₹${eligible})`,
      },
    );
    await markBookingRefunded(admin, bookingId, eligible, reason);
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

  const ledgerWritten = await insertWalletTx(
    admin,
    {
      user_id: userId,
      booking_id: bookingId,
      type: "credit",
      amount_inr: delta,
      // Keep the production-standard reason so the app's history labels match.
      reason: alreadyCredited > 0 ? "booking_refund_topup" : "booking_cancel_refund",
    },
    {
      reference_type: "booking_refund",
      notes: alreadyCredited > 0
        ? `Refund adjustment for cancelled booking (paid ₹${paid})`
        : `Refund for cancelled booking (paid ₹${paid})`,
    },
    alreadyCredited > 0
      ? ["booking_cancel_refund", "refund_adjustment"]
      : ["booking_refund_topup", "refund_adjustment"],
  );

  if (!ledgerWritten) {
    // Untracked money is worse than a delayed refund: roll the credit back so
    // the next call recomputes cleanly instead of double-crediting.
    console.error("[refundBookingToWallet] ledger row missing — reverting", bookingId, delta);
    await admin.rpc("safe_wallet_increment", { p_user_id: userId, p_amount_delta: -delta });
    return {
      error: "ledger_insert_failed",
      paid_amount: paid,
      already_credited: alreadyCredited,
    };
  }

  await markBookingRefunded(admin, bookingId, eligible, reason);

  return {
    refunded: true,
    paid_amount: paid,
    already_credited: alreadyCredited,
    refund_amount: eligible,
  };
}

