import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

// Server-authoritative switch of an UNPAID booking to pay-after-service.
// Replaces direct client writes to bookings.payment_status/payment_method.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const clean = (v?: string | null) => (v ?? "").trim() || null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SWITCHABLE = new Set(["pending", "failed", "created", "awaiting_payment", "payment_pending"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const token = extractToken(req);
    if (!token) return json({ error: "not_authenticated" }, 401);
    let fb;
    try { fb = await verifyFirebaseToken(token); } catch { return json({ error: "not_authenticated" }, 401); }

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === "string" ? body.booking_id : "";
    if (!UUID.test(bookingId)) return json({ error: "invalid_booking_id" }, 400);

    const url = clean(Deno.env.get("EXTERNAL_SUPABASE_URL")) || "https://paywwbuqycovjopryele.supabase.co";
    const key = clean(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) || clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!key) return json({ error: "server_misconfigured" }, 500);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: cfg } = await db.from("app_config").select("enable_pay_after_service").limit(1).maybeSingle();
    if (!cfg?.enable_pay_after_service) return json({ error: "pay_after_service_disabled" }, 403);

    const { data: profile } = await db.from("profiles").select("id").eq("firebase_uid", fb.uid).maybeSingle();
    if (!profile) return json({ error: "profile_not_found" }, 404);

    const { data: booking } = await db.from("bookings")
      .select("id, user_id, status, payment_status, razorpay_payment_id")
      .eq("id", bookingId).maybeSingle();
    if (!booking || booking.user_id !== profile.id) return json({ error: "booking_not_found" }, 404);
    if (booking.payment_status === "pay_after_service") return json({ success: true, already: true });
    if (["completed", "cancelled"].includes(String(booking.status))) return json({ error: "booking_closed" }, 409);
    // Never downgrade a booking where a provider payment was already captured/recorded.
    if (booking.razorpay_payment_id || !SWITCHABLE.has(String(booking.payment_status ?? "pending"))) {
      return json({ error: "payment_already_recorded" }, 409);
    }

    const { data: rows, error } = await db.from("bookings")
      .update({ payment_method: "pay_after_service", payment_status: "pay_after_service" })
      .eq("id", bookingId).eq("user_id", profile.id).is("razorpay_payment_id", null)
      .eq("payment_status", booking.payment_status ?? "pending")
      .select("id");
    if (error) return json({ error: "update_failed" }, 500);
    if (!rows?.length) return json({ error: "state_changed" }, 409);
    return json({ success: true });
  } catch {
    return json({ error: "internal_error" }, 500);
  }
});
