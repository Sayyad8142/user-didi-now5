/**
 * booking-tip — "Tip your Didi".
 * actions: status | pay | verify
 * All money moves inside the DB function apply_booking_tip (atomic, idempotent).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY } from "../_shared/externalSupabaseEnv.ts";

const RZP_ID = Deno.env.get("RAZORPAY_KEY_ID") || "";
const RZP_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
const ALLOWED = [10, 20, 30, 40, 50];
const MAX_TIP = 50;
const TIPPABLE_BLOCKED = ["pending", "dispatched", "searching", "cancelled", "completed", "failed", "expired"];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const rzpAuth = () => "Basic " + btoa(`${RZP_ID}:${RZP_SECRET}`);

async function hmac(body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(RZP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
async function applyFromPaidOrder(sb: any, tip: any, paymentId: string, amountPaise: number) {
  const rzpAmount = Math.round(amountPaise) / 100;
  if (Math.abs(rzpAmount - Number(tip.razorpay_amount_used)) > 0.01) {
    console.error("[booking-tip] AMOUNT_MISMATCH", tip.id, rzpAmount, tip.razorpay_amount_used);
  }
  const { data, error } = await sb.rpc("apply_booking_tip", {
    p_idempotency_key: tip.idempotency_key, p_user_id: tip.customer_id, p_booking_id: tip.booking_id,
    p_amount: Number(tip.tip_amount), p_razorpay_amount: rzpAmount,
    p_razorpay_payment_id: paymentId, p_razorpay_order_id: tip.razorpay_order_id,
  });
  if (error) throw new Error(error.message);
  return data;
}

// deno-lint-ignore no-explicit-any
async function recoverPendingOrders(sb: any, bookingId: string) {
  const { data: pend } = await sb.from("booking_tips").select("*")
    .eq("booking_id", bookingId).eq("status", "pending").not("razorpay_order_id", "is", null);
  for (const tip of pend || []) {
    try {
      const r = await fetch(`https://api.razorpay.com/v1/orders/${tip.razorpay_order_id}/payments`,
        { headers: { Authorization: rzpAuth() } });
      if (!r.ok) continue;
      // deno-lint-ignore no-explicit-any
      const p = ((await r.json()).items || []).find((x: any) => x.status === "captured" || x.status === "authorized");
      if (p) await applyFromPaidOrder(sb, tip, p.id, p.amount);
    } catch (e) { console.warn("[booking-tip] recover failed", tip.id, e); }
  }
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

    const sb = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await sb.from("profiles").select("id").eq("firebase_uid", fb.uid).maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 404);

    const { data: booking } = await sb.from("bookings").select("id, user_id, worker_id, status").eq("id", bookingId).maybeSingle();
    if (!booking) return json({ error: "booking_not_found" }, 404);
    if (booking.user_id !== profile.id) return json({ error: "not_owner" }, 403);

    const tippable = !!booking.worker_id && !TIPPABLE_BLOCKED.includes(booking.status);

    const summary = async () => {
      const { data: tips, error } = await sb.from("booking_tips")
        .select("tip_amount, status").eq("booking_id", bookingId);
      if (error) return { enabled: false, tippable: false, total_tip: 0, remaining: 0, options: [] };
      // deno-lint-ignore no-explicit-any
      const total = (tips || []).filter((t: any) => ["paid", "credited_to_worker"].includes(t.status))
        // deno-lint-ignore no-explicit-any
        .reduce((s: number, t: any) => s + Number(t.tip_amount), 0);
      const remaining = Math.max(0, MAX_TIP - total);
      return {
        enabled: true, tippable: tippable && remaining > 0, total_tip: total, remaining,
        options: ALLOWED.filter((a) => a <= remaining),
      };
    };

    if (action === "status") {
      await recoverPendingOrders(sb, bookingId);
      return json(await summary());
    }

    if (action === "pay") {
      const amount = Number(body?.amount);
      const key = String(body?.idempotency_key || "");
      if (!ALLOWED.includes(amount)) return json({ error: "invalid_amount" }, 400);
      if (key.length < 8 || key.length > 100) return json({ error: "idempotency_key required" }, 400);
      if (!tippable) return json({ error: "booking_not_tippable" }, 409);
      const s = await summary();
      if (!s.enabled) return json({ error: "tips_unavailable" }, 503);
      if (amount > s.remaining) return json({ error: "tip_limit_exceeded", remaining: s.remaining }, 409);

      // Re-use an existing order for the same key (double tap / retry)
      const { data: existing } = await sb.from("booking_tips").select("*").eq("idempotency_key", key).maybeSingle();
      if (existing && existing.status !== "pending") return json({ success: true, status: existing.status, already_applied: true });
      if (existing?.razorpay_order_id) {
        return json({ needs_razorpay: true, order_id: existing.razorpay_order_id,
          amount: Math.round(Number(existing.razorpay_amount_used) * 100), currency: "INR", key_id: RZP_ID });
      }

      const { data: w } = await sb.from("user_wallets").select("balance_inr").eq("user_id", profile.id).maybeSingle();
      const walletBal = Math.max(0, Number(w?.balance_inr ?? 0));

      if (walletBal >= amount) {
        const { data, error } = await sb.rpc("apply_booking_tip", {
          p_idempotency_key: key, p_user_id: profile.id, p_booking_id: bookingId, p_amount: amount,
          p_razorpay_amount: 0, p_razorpay_payment_id: null, p_razorpay_order_id: null,
        });
        if (error) return json({ error: error.message }, 500);
        if (data?.error) return json({ error: data.error }, 409);
        return json({ success: true, ...data, summary: await summary() });
      }

      const rzpAmount = amount - Math.floor(walletBal);
      const r = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { Authorization: rzpAuth(), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: rzpAmount * 100, currency: "INR", receipt: `tip_${key}`.slice(0, 40),
          notes: { purpose: "tip", booking_id: bookingId, tip_amount: String(amount), idempotency_key: key },
        }),
      });
      const order = await r.json();
      if (!r.ok) { console.error("[booking-tip] order failed", order); return json({ error: "order_failed" }, 502); }

      const { error: insErr } = await sb.from("booking_tips").insert({
        booking_id: bookingId, customer_id: profile.id, worker_id: booking.worker_id, tip_amount: amount,
        razorpay_amount_used: rzpAmount, wallet_amount_used: amount - rzpAmount,
        razorpay_order_id: order.id, idempotency_key: key, status: "pending",
      });
      if (insErr && insErr.code !== "23505") return json({ error: insErr.message }, 500);
      console.log(`[booking-tip] order ${order.id} tip=₹${amount} wallet=₹${amount - rzpAmount} rzp=₹${rzpAmount}`);
      return json({ needs_razorpay: true, order_id: order.id, amount: rzpAmount * 100, currency: "INR", key_id: RZP_ID });
    }

    if (action === "verify") {
      const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = body || {};
      if (!oid || !pid) return json({ error: "payment details required" }, 400);
      const { data: tip } = await sb.from("booking_tips").select("*").eq("razorpay_order_id", oid).maybeSingle();
      if (!tip || tip.booking_id !== bookingId || tip.customer_id !== profile.id) return json({ error: "tip_not_found" }, 404);
      if (sig) {
        if ((await hmac(`${oid}|${pid}`)) !== sig) return json({ error: "invalid_signature" }, 400);
      }
      // Always confirm with Razorpay itself
      const r = await fetch(`https://api.razorpay.com/v1/payments/${pid}`, { headers: { Authorization: rzpAuth() } });
      const p = await r.json();
      if (!r.ok || p.order_id !== oid || !["captured", "authorized"].includes(p.status)) {
        return json({ error: "payment_not_confirmed" }, 402);
      }
      const data = await applyFromPaidOrder(sb, tip, pid, p.amount);
      if (data?.error) return json({ error: data.error, refunded_to_wallet: data.refunded_to_wallet }, 409);
      return json({ success: true, ...data, summary: await summary() });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[booking-tip] error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});
