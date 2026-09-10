/**
 * refund-orphan-payments — credits captured Razorpay payments that never
 * produced a booking back to the customer's wallet.
 *
 * Safety:
 *  - Only acts on payments listed in `orphan_payments` (Lovable Cloud) that are
 *    still unresolved.
 *  - Re-verifies each payment directly with Razorpay (must be captured).
 *  - Re-checks the authoritative bookings table: if a booking exists for that
 *    payment/order, it is NOT refunded.
 *  - Idempotent: a wallet_transactions row keyed by the payment id is checked
 *    first, so repeat runs never double-credit.
 *  - Never refunds money at Razorpay and never charges anyone.
 *
 * Body: { payment_ids?: string[], dry_run?: boolean }
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    let paymentIds: string[] | null = null;
    let dryRun = false;
    try {
      const body = await req.json();
      if (Array.isArray(body?.payment_ids)) paymentIds = body.payment_ids;
      dryRun = body?.dry_run === true;
    } catch { /* no body */ }

    const cloud = createClient(CLOUD_URL, CLOUD_SERVICE_KEY);
    const external = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);
    const auth = "Basic " + btoa(`${RZP_ID}:${RZP_SECRET}`);

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
      const step = (outcome: string, extra: Record<string, unknown> = {}) =>
        results.push({ payment_id: pid, amount_inr: row.amount_inr, outcome, ...extra });

      if (!row.user_id) { step("skipped_no_user"); continue; }

      // 1. Verify with Razorpay
      const rp = await fetch(`https://api.razorpay.com/v1/payments/${pid}`, {
        headers: { Authorization: auth },
      });
      if (!rp.ok) { step("skipped_razorpay_lookup_failed", { status: rp.status }); continue; }
      const payment = await rp.json();
      if (payment.status !== "captured") { step("skipped_not_captured", { status: payment.status }); continue; }
      const amount = Number(payment.amount) / 100;

      // 2. A booking must genuinely not exist
      const { data: byPayment } = await external.from("bookings").select("id").eq("razorpay_payment_id", pid).limit(1);
      const { data: byOrder } = await external.from("bookings").select("id").eq("razorpay_order_id", row.razorpay_order_id).limit(1);
      if (byPayment?.length || byOrder?.length) {
        await cloud.from("orphan_payments")
          .update({ status: "booking_found", resolved_at: new Date().toISOString(), resolved_by: "refund-orphan-payments" })
          .eq("id", row.id);
        step("skipped_booking_exists");
        continue;
      }

      // 3. Idempotency — ledger row already present?
      const { data: existingTx } = await external
        .from("wallet_transactions")
        .select("id")
        .eq("user_id", row.user_id)
        .ilike("notes", `%${pid}%`)
        .limit(1);
      if (existingTx?.length) {
        await cloud.from("orphan_payments")
          .update({ status: "refunded_to_wallet", resolved_at: new Date().toISOString(), resolved_by: "refund-orphan-payments" })
          .eq("id", row.id);
        step("already_refunded");
        continue;
      }

      if (dryRun) { step("would_refund", { amount_inr: amount }); continue; }

      // 4. Credit the wallet atomically
      const { data: incResult, error: incErr } = await external.rpc("safe_wallet_increment", {
        p_user_id: row.user_id,
        p_amount_delta: amount,
        p_min_balance: 0,
      });
      if (incErr || (incResult && typeof incResult === "object" && (incResult as any).error)) {
        step("failed_wallet_credit", { error: incErr?.message ?? (incResult as any)?.error });
        continue;
      }

      // 5. Ledger row (payment id inside notes = idempotency key)
      const { error: txErr } = await external.from("wallet_transactions").insert({
        user_id: row.user_id,
        amount_inr: amount,
        type: "credit",
        reason: "payment_without_booking_refund",
        reference_type: "orphan_payment_refund",
        notes: `Refund for captured payment with no booking (${pid})`,
      });
      if (txErr) {
        console.error(`[refund-orphan-payments] ledger insert failed for ${pid}: ${txErr.message}`);
        step("credited_but_ledger_failed", { error: txErr.message, new_balance: (incResult as any)?.new_balance });
        continue;
      }

      await cloud.from("orphan_payments")
        .update({
          status: "refunded_to_wallet",
          resolved_at: new Date().toISOString(),
          resolved_by: "refund-orphan-payments",
        })
        .eq("id", row.id);

      console.log(`[refund-orphan-payments] refunded ₹${amount} to user=${row.user_id} payment=${pid}`);
      step("refunded", { amount_inr: amount, new_balance: (incResult as any)?.new_balance });
    }

    return new Response(JSON.stringify({ ok: true, dry_run: dryRun, count: results.length, results }, null, 2), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[refund-orphan-payments] fatal:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
