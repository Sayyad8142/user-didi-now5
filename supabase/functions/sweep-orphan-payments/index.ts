/**
 * sweep-orphan-payments — "Paid Without Booking" detector.
 *
 * Reads recent captured Razorpay payments and cross-checks the authoritative
 * bookings table (external DB). Any captured payment with:
 *   - no booking carrying that razorpay_payment_id / razorpay_order_id, and
 *   - no recoverable pending_bookings intent
 * is recorded in `orphan_payments` (Lovable Cloud DB) so Admin can see and
 * act on it. Read-only against Razorpay and bookings — it never creates,
 * modifies or refunds anything.
 *
 * GET/POST body: { days?: number }  (default 7, max 30)
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
    let days = 7;
    try {
      const body = await req.json();
      if (body?.days) days = Math.min(30, Math.max(1, Number(body.days)));
    } catch { /* no body */ }

    const external = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);
    const cloud = createClient(CLOUD_URL, CLOUD_SERVICE_KEY);

    const from = Math.floor(Date.now() / 1000) - days * 86400;
    const auth = "Basic " + btoa(`${RZP_ID}:${RZP_SECRET}`);
    const rp = await fetch(`https://api.razorpay.com/v1/payments?count=100&from=${from}`, {
      headers: { Authorization: auth },
    });
    if (!rp.ok) {
      return new Response(JSON.stringify({ error: `Razorpay ${rp.status}` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const items: any[] = (await rp.json()).items ?? [];
    const captured = items.filter((p) => p.status === "captured" || p.status === "authorized");

    const orphans: any[] = [];

    for (const p of captured) {
      const { data: byPayment } = await external
        .from("bookings")
        .select("id")
        .eq("razorpay_payment_id", p.id)
        .limit(1);
      if (byPayment?.length) continue;

      const { data: byOrder } = await external
        .from("bookings")
        .select("id")
        .eq("razorpay_order_id", p.order_id)
        .limit(1);
      if (byOrder?.length) continue;

      const { data: pending } = await external
        .from("pending_bookings")
        .select("razorpay_order_id, status, booking_id, booking_data")
        .eq("razorpay_order_id", p.order_id)
        .limit(1);

      const pendingRow = pending?.[0] ?? null;
      const recoverable = !!pendingRow?.booking_data;

      orphans.push({
        razorpay_payment_id: p.id,
        razorpay_order_id: p.order_id,
        amount_inr: p.amount / 100,
        currency: p.currency ?? "INR",
        user_id: p.notes?.user_id ?? null,
        status: recoverable ? "recoverable" : "unmapped",
        notes: JSON.stringify({
          contact: p.contact,
          method: p.method,
          paid_at: new Date(p.created_at * 1000).toISOString(),
          service_type: p.notes?.service_type ?? null,
          request_id: p.notes?.request_id ?? null,
          pending_status: pendingRow?.status ?? "missing",
          reason: recoverable
            ? "Payment intent exists — reconcile can rebuild the booking"
            : "No booking and no stored booking intent — needs manual review",
        }),
      });
    }

    // Upsert into the Admin-visible orphan_payments ledger (idempotent by payment id).
    let recorded = 0;
    for (const o of orphans) {
      const { data: existing } = await cloud
        .from("orphan_payments")
        .select("id")
        .eq("razorpay_payment_id", o.razorpay_payment_id)
        .limit(1);
      if (existing?.length) continue;
      const { error: insErr } = await cloud.from("orphan_payments").insert(o);
      if (insErr) {
        console.error("[sweep-orphan-payments] insert failed:", insErr.message);
      } else {
        recorded++;
      }
    }

    console.log(
      `[sweep-orphan-payments] days=${days} captured=${captured.length} orphans=${orphans.length} newly_recorded=${recorded}`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        days,
        captured_payments: captured.length,
        orphans: orphans.length,
        newly_recorded: recorded,
        details: orphans,
      }, null, 2),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[sweep-orphan-payments] fatal:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
