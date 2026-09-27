/**
 * booking-tip — "Tip your Didi" (Tip V2 interface).
 * actions: status | start | verify | abandon
 *
 * Money moves ONLY inside the Tip V2 DB functions
 * (docs/tips-v2-payout-inclusive-migration.sql in the Admin project):
 *   start_booking_tip / attach_tip_razorpay_order / abandon_booking_tip  (customer-scoped)
 *   confirm_tip_razorpay                                                (service-role only)
 *
 * Customer-scoped RPCs are called with the customer's own Firebase token via the
 * production API (which maps Firebase → auth.uid()/get_profile_id()), so the DB's
 * ownership checks apply. Razorpay verification stays here, server-side.
 * No fallback to the old V1 tip flow: if V2 is not installed, tips are hidden.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY } from "../_shared/externalSupabaseEnv.ts";

const RZP_ID = Deno.env.get("RAZORPAY_KEY_ID") || "";
const RZP_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
const USER_API_URL = Deno.env.get("TIP_USER_API_URL") || "https://api.didisnow.com";
const PROD_ANON = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";
const ALLOWED = [10, 20, 30, 40, 50];
const MAX_TIP = 50;
const OPEN_STATES = ["assigned", "accepted", "on_the_way", "started"];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const rzpAuth = () => "Basic " + btoa(`${RZP_ID}:${RZP_SECRET}`);
const isMissing = (e: { code?: string } | null) => !!e && ["PGRST202", "PGRST205", "42P01", "42883"].includes(e.code || "");

async function hmac(body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(RZP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
type Sb = any;

/** Confirm a paid Razorpay tip order via the service-role-only V2 RPC. */
async function confirmPaid(admin: Sb, orderId: string, paymentId: string, amountPaise: number) {
  const { data, error } = await admin.rpc("confirm_tip_razorpay", {
    p_razorpay_order_id: orderId, p_razorpay_payment_id: paymentId,
    p_amount_inr: Math.round(amountPaise / 100),
  });
  if (error) throw new Error(error.message);
  console.log(`[booking-tip] confirm ${orderId}/${paymentId}`, JSON.stringify(data));
  return data;
}

/** Look up a captured/authorized payment on a Razorpay order (server-side truth). */
async function findPaidPayment(orderId: string) {
  const r = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, { headers: { Authorization: rzpAuth() } });
  if (!r.ok) return null;
  // deno-lint-ignore no-explicit-any
  return ((await r.json()).items || []).find((x: any) => x.status === "captured" || x.status === "authorized") || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = extractToken(req);
    if (!token) return json({ error: "Not authenticated" }, 401);
    const fb = await verifyFirebaseToken(token);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "status");
    const bookingId = String(body?.booking_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return json({ error: "booking_id required" }, 400);

    const admin = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);
    // Customer-scoped client: DB ownership checks see this customer, never a client-chosen id.
    const asUser = createClient(USER_API_URL, PROD_ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await admin.from("profiles").select("id").eq("firebase_uid", fb.uid).maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 404);
    const { data: booking } = await admin.from("bookings")
      .select("id, user_id, worker_id, status, price_inr").eq("id", bookingId).maybeSingle();
    if (!booking) return json({ error: "booking_not_found" }, 404);
    if (booking.user_id !== profile.id) return json({ error: "not_owner" }, 403);

    // Recover any processing attempt whose Razorpay payment already succeeded
    // (app closed / webhook delayed). Server checks Razorpay itself.
    const recover = async () => {
      const { data: pend, error } = await admin.from("booking_tip_payments")
        .select("id, razorpay_order_id").eq("booking_id", bookingId).eq("status", "processing")
        .not("razorpay_order_id", "is", null);
      if (error) return;
      for (const p of pend || []) {
        try {
          const paid = await findPaidPayment(p.razorpay_order_id);
          if (paid) await confirmPaid(admin, p.razorpay_order_id, paid.id, paid.amount);
        } catch (e) { console.warn("[booking-tip] recover failed", p.id, e); }
      }
    };

    const summary = async () => {
      const { data: tip, error } = await admin.from("booking_tips").select("*").eq("booking_id", bookingId).maybeSingle();
      if (isMissing(error)) return { enabled: false };
      if (error) throw new Error(error.message);
      const { data: pays } = await admin.from("booking_tip_payments")
        .select("id, increment_inr, status, razorpay_amount_inr, updated_at")
        .eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(10);
      const confirmed = Number(tip?.amount_inr || 0);
      const pending = Number(tip?.pending_amount_inr || 0);
      const remaining = Math.max(0, MAX_TIP - confirmed - pending);
      // deno-lint-ignore no-explicit-any
      const late = (pays || []).filter((p: any) => p.status === "refunded_to_wallet")
        // deno-lint-ignore no-explicit-any
        .reduce((s: number, p: any) => s + Number(p.increment_inr), 0);
      const last = pays?.[0] || null;
      const open = !!booking.worker_id && OPEN_STATES.includes(booking.status);
      return {
        enabled: true,
        tippable: open && remaining > 0,
        service_price: booking.price_inr,
        total_tip: confirmed,
        pending_tip: pending,
        remaining,
        options: open ? ALLOWED.filter((a) => a <= remaining) : [],
        payout_status: tip?.payout_status || "unpaid",           // unpaid | included_in_payout
        refund_status: tip?.refund_status || "none",             // none | refunded_to_wallet
        refunded_amount: Number(tip?.refunded_amount_inr || 0),  // cancellation refund
        late_refunded_amount: late,                              // paid after completion → wallet
        last_attempt: last ? { id: last.id, status: last.status, amount: Number(last.increment_inr) } : null,
      };
    };

    if (action === "status") {
      await recover();
      return json(await summary());
    }

    if (action === "start") {
      const amount = Number(body?.amount);
      const key = String(body?.idempotency_key || "");
      if (!ALLOWED.includes(amount)) return json({ error: "invalid_amount" }, 400);
      if (key.length < 8 || key.length > 100) return json({ error: "idempotency_key required" }, 400);

      const { data: res, error } = await asUser.rpc("start_booking_tip", {
        p_booking_id: bookingId, p_increment_inr: amount, p_idempotency_key: key,
      });
      if (isMissing(error)) return json({ error: "tips_unavailable" }, 503);
      if (error) return json({ error: error.message }, 500);
      if (!res?.success) return json({ error: res?.error || "start_failed", remaining: res?.remaining_inr }, 409);
      console.log(`[booking-tip] start key=${key} tip=₹${amount}`, JSON.stringify(res));

      if (res.status !== "razorpay_required" && res.status !== "processing") {
        return json({ status: res.status, tip_payment_id: res.tip_payment_id, summary: await summary() });
      }

      const shortfall = Number(res.razorpay_amount_inr);
      const tipPaymentId = String(res.tip_payment_id);
      // Reuse the order already attached to this attempt (retry / double tap).
      const { data: pay } = await admin.from("booking_tip_payments")
        .select("razorpay_order_id, razorpay_amount_inr, status, customer_id").eq("id", tipPaymentId).maybeSingle();
      if (!pay || pay.customer_id !== profile.id) return json({ error: "tip_not_found" }, 404);
      if (pay.status !== "processing") return json({ status: pay.status, tip_payment_id: tipPaymentId, summary: await summary() });
      let orderId: string | null = pay.razorpay_order_id;

      if (!orderId) {
        const r = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: { Authorization: rzpAuth(), "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: shortfall * 100, currency: "INR", receipt: `tipv2_${tipPaymentId}`.slice(0, 40),
            notes: { purpose: "tip_v2", booking_id: bookingId, tip_payment_id: tipPaymentId, tip_amount: String(amount) },
          }),
        });
        const order = await r.json();
        if (!r.ok) { console.error("[booking-tip] order failed", order); return json({ error: "order_failed", tip_payment_id: tipPaymentId }, 502); }
        const { data: att, error: attErr } = await asUser.rpc("attach_tip_razorpay_order", {
          p_tip_payment_id: tipPaymentId, p_razorpay_order_id: order.id,
        });
        if (attErr || !att?.success) {
          console.error("[booking-tip] attach failed", attErr?.message, JSON.stringify(att));
          return json({ error: "attach_failed", tip_payment_id: tipPaymentId }, 409);
        }
        orderId = order.id;
      }
      console.log(`[booking-tip] tip=${tipPaymentId} order=${orderId} shortfall=₹${shortfall} wallet=₹${res.wallet_amount_inr}`);
      return json({ status: "razorpay_required", tip_payment_id: tipPaymentId, order_id: orderId,
        amount: shortfall * 100, currency: "INR", key_id: RZP_ID, wallet_amount: Number(res.wallet_amount_inr || 0) });
    }

    if (action === "verify") {
      const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig, tip_payment_id: tpid } = body || {};
      if (!oid || !pid || !tpid) return json({ error: "payment details required" }, 400);
      const { data: pay } = await admin.from("booking_tip_payments").select("*").eq("id", tpid).maybeSingle();
      if (!pay || pay.booking_id !== bookingId || pay.customer_id !== profile.id || pay.razorpay_order_id !== oid) {
        return json({ error: "tip_not_found" }, 404);
      }
      if (sig && (await hmac(`${oid}|${pid}`)) !== sig) return json({ error: "invalid_signature" }, 400);
      const r = await fetch(`https://api.razorpay.com/v1/payments/${pid}`, { headers: { Authorization: rzpAuth() } });
      const p = await r.json();
      if (!r.ok || p.order_id !== oid || !["captured", "authorized"].includes(p.status)) {
        return json({ error: "payment_not_confirmed" }, 402);
      }
      if (Number(p.amount) !== Number(pay.razorpay_amount_inr) * 100) {
        console.error("[booking-tip] AMOUNT_MISMATCH", tpid, p.amount, pay.razorpay_amount_inr);
        return json({ error: "amount_mismatch" }, 409);
      }
      const data = await confirmPaid(admin, oid, pid, p.amount);
      if (!data?.success) return json({ error: data?.error || "confirm_failed" }, 409);
      return json({ status: data.status, summary: await summary() });
    }

    if (action === "abandon") {
      const tpid = String(body?.tip_payment_id || "");
      const { data: pay } = await admin.from("booking_tip_payments").select("*").eq("id", tpid).maybeSingle();
      if (!pay || pay.booking_id !== bookingId || pay.customer_id !== profile.id) return json({ error: "tip_not_found" }, 404);
      // Never abandon an attempt Razorpay actually took money for (e.g. QR paid after close).
      if (pay.status === "processing" && pay.razorpay_order_id) {
        const paid = await findPaidPayment(pay.razorpay_order_id);
        if (paid) {
          const data = await confirmPaid(admin, pay.razorpay_order_id, paid.id, paid.amount);
          return json({ status: data?.status, summary: await summary() });
        }
      }
      const { data, error } = await asUser.rpc("abandon_booking_tip", { p_tip_payment_id: tpid });
      if (error) return json({ error: error.message }, 500);
      return json({ status: data?.status || "abandoned", summary: await summary() });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[booking-tip] error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});
