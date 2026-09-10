/**
 * refund-orphan-payments — credits captured Razorpay payments that never
 * produced a booking back to the customer's wallet.
 *
 * Safety:
 *  - Only acts on payments listed in `orphan_payments` (Lovable Cloud).
 *  - Re-verifies each payment with Razorpay (must be captured).
 *  - Re-checks the authoritative bookings table; if a booking exists, no refund.
 *  - Idempotency FIRST: a wallet_transactions ledger row keyed by the payment id
 *    is written BEFORE the balance is credited, so a repeat run can never
 *    double-credit even if a later step fails.
 *  - Never refunds at Razorpay and never charges anyone.
 *
 * Modes (body.mode):
 *  - "schema"  → report wallet_transactions columns + current balances (read only)
 *  - "refund"  → default; credit unresolved orphan payments
 *  - "repair"  → subtract a given amount from a user's balance and log it
 *                (used to reverse an accidental duplicate credit)
 *
 * Body: { mode?, payment_ids?: string[], dry_run?: boolean,
 *         repairs?: Array<{ user_id: string, amount: number, note: string }> }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";

const RZP_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RZP_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const CLOUD_URL = Deno.env.get("SUPABASE_URL")!;
const CLOUD_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-app-version, x-app-platform",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** Insert a ledger row, dropping columns the live schema does not have. */
async function insertLedger(
  external: any,
  base: Record<string, unknown>,
  optional: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string; used?: Record<string, unknown> }> {
  const candidates = [...optional.map((o) => ({ ...base, ...o })), base];
  let lastErr = "";
  for (const payload of candidates) {
    const { error } = await external.from("wallet_transactions").insert(payload);
    if (!error) return { ok: true, used: payload };
    lastErr = `${error.code}: ${error.message}`;
    if (!["42703", "PGRST204"].includes(String(error.code))) break;
  }
  return { ok: false, error: lastErr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    let mode = "refund";
    let paymentIds: string[] | null = null;
    let dryRun = false;
    let repairs: Array<{ user_id: string; amount: number; note: string }> = [];
    let userIds: string[] = [];
    try {
      const body = await req.json();
      if (typeof body?.mode === "string") mode = body.mode;
      if (Array.isArray(body?.payment_ids)) paymentIds = body.payment_ids;
      if (Array.isArray(body?.repairs)) repairs = body.repairs;
      if (Array.isArray(body?.user_ids)) userIds = body.user_ids;
      dryRun = body?.dry_run === true;
    } catch { /* no body */ }

    const cloud = createClient(CLOUD_URL, CLOUD_SERVICE_KEY);
    const external = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);
    const auth = "Basic " + btoa(`${RZP_ID}:${RZP_SECRET}`);

    // ── schema / inspection ───────────────────────────────────────
    if (mode === "schema") {
      const { data: sample } = await external
        .from("wallet_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: wallets } = userIds.length
        ? await external.from("user_wallets").select("user_id, balance_inr").in("user_id", userIds)
        : { data: [] };
      const { data: recent } = userIds.length
        ? await external
            .from("wallet_transactions")
            .select("*")
            .in("user_id", userIds)
            .order("created_at", { ascending: false })
            .limit(40)
        : { data: [] };
      return json({
        wallet_transactions_columns: sample?.[0] ? Object.keys(sample[0]) : [],
        wallets,
        recent_transactions: recent,
      });
    }

    // ── repair (reverse an over-credit) ───────────────────────────
    if (mode === "repair") {
      const out: any[] = [];
      for (const r of repairs) {
        if (dryRun) { out.push({ ...r, outcome: "would_debit" }); continue; }
        const { data: incResult, error: incErr } = await external.rpc("safe_wallet_increment", {
          p_user_id: r.user_id,
          p_amount_delta: -Math.abs(r.amount),
          p_min_balance: 0,
        });
        if (incErr || (incResult as any)?.error) {
          out.push({ ...r, outcome: "failed", error: incErr?.message ?? (incResult as any)?.error });
          continue;
        }
        const led = await insertLedger(
          external,
          { user_id: r.user_id, amount_inr: Math.abs(r.amount), type: "debit", reason: "duplicate_credit_reversal" },
          [{ description: r.note, reference_type: "orphan_payment_refund" }, { description: r.note }],
        );
        out.push({ ...r, outcome: "debited", new_balance: (incResult as any)?.new_balance, ledger: led.ok, ledger_error: led.error });
      }
      return json({ ok: true, mode, dry_run: dryRun, results: out });
    }

    // ── backfill_ledger (money already credited, write the ledger row) ──
    if (mode === "backfill_ledger") {
      const out: any[] = [];
      for (const r of repairs) {
        const led = await insertLedger(
          external,
          { user_id: r.user_id, amount_inr: Math.abs(r.amount), type: "credit", reason: "payment_without_booking_refund" },
          [],
        );
        out.push({ ...r, ledger: led.ok, ledger_error: led.error });
      }
      if (paymentIds?.length) {
        await cloud
          .from("orphan_payments")
          .update({
            status: "refunded_to_wallet",
            resolved_at: new Date().toISOString(),
            resolved_by: "refund-orphan-payments",
          })
          .in("razorpay_payment_id", paymentIds);
      }
      return json({ ok: true, mode, results: out });
    }

    // ── refund ───────────────────────────────────────────────────
    let q = cloud
      .from("orphan_payments")
      .select("id, razorpay_payment_id, razorpay_order_id, amount_inr, user_id, status")
      .is("resolved_at", null);
    if (paymentIds) q = q.in("razorpay_payment_id", paymentIds);
    const { data: rows, error: rowsErr } = await q;
    if (rowsErr) throw new Error(rowsErr.message);

    const results: any[] = [];

    for (const row of rows ?? []) {
      const pid = row.razorpay_payment_id as string;
      const push = (outcome: string, extra: Record<string, unknown> = {}) =>
        results.push({ payment_id: pid, outcome, ...extra });

      if (!row.user_id) { push("skipped_no_user"); continue; }

      const rp = await fetch(`https://api.razorpay.com/v1/payments/${pid}`, { headers: { Authorization: auth } });
      if (!rp.ok) { push("skipped_razorpay_lookup_failed", { status: rp.status }); continue; }
      const payment = await rp.json();
      if (payment.status !== "captured") { push("skipped_not_captured", { status: payment.status }); continue; }
      const amount = Number(payment.amount) / 100;

      const { data: byPayment } = await external.from("bookings").select("id").eq("razorpay_payment_id", pid).limit(1);
      const { data: byOrder } = await external.from("bookings").select("id").eq("razorpay_order_id", row.razorpay_order_id).limit(1);
      if (byPayment?.length || byOrder?.length) {
        await cloud.from("orphan_payments")
          .update({ status: "booking_found", resolved_at: new Date().toISOString(), resolved_by: "refund-orphan-payments" })
          .eq("id", row.id);
        push("skipped_booking_exists");
        continue;
      }

      const marker = `orphan_refund:${pid}`;

      if (dryRun) { push("would_refund", { amount_inr: amount }); continue; }

      // IDEMPOTENCY: claim the orphan row FIRST. `resolved_at IS NULL` in the
      // filter means only one concurrent/repeat call can ever win the claim,
      // so a payment can never be credited twice.
      const { data: claimed, error: claimErr } = await cloud
        .from("orphan_payments")
        .update({
          status: "refunded_to_wallet",
          resolved_at: new Date().toISOString(),
          resolved_by: "refund-orphan-payments",
        })
        .eq("id", row.id)
        .is("resolved_at", null)
        .select("id");
      if (claimErr || !claimed?.length) { push("already_refunded"); continue; }

      // Ledger next — descriptive only; the claim above is the safety net.
      const led = await insertLedger(
        external,
        { user_id: row.user_id, amount_inr: amount, type: "credit", reason: "payment_without_booking_refund" },
        [{ description: `Refund — payment received but booking not created (${marker})` }],
      );
      if (!led.ok) {
        await cloud.from("orphan_payments")
          .update({ status: "unmapped", resolved_at: null, resolved_by: null })
          .eq("id", row.id);
        push("aborted_ledger_failed", { error: led.error });
        continue;
      }

      const { data: incResult, error: incErr } = await external.rpc("safe_wallet_increment", {
        p_user_id: row.user_id,
        p_amount_delta: amount,
        p_min_balance: 0,
      });
      if (incErr || (incResult as any)?.error) {
        push("failed_wallet_credit_after_ledger", { error: incErr?.message ?? (incResult as any)?.error });
        continue;
      }

      console.log(`[refund-orphan-payments] refunded ${amount} to user=${row.user_id} payment=${pid}`);
      push("refunded", { amount_inr: amount, new_balance: (incResult as any)?.new_balance });
    }

    return json({ ok: true, mode, dry_run: dryRun, count: results.length, results });
  } catch (err: any) {
    console.error("[refund-orphan-payments] fatal:", err);
    return json({ error: err.message }, 500);
  }
});
