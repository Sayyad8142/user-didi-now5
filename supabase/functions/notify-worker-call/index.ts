/**
 * notify-worker-call — Customer-initiated ring of the assigned worker.
 *
 * Verifies the caller is the booking's customer, then pushes a
 * high-priority FCM data message to the worker so the worker app can
 * present its full-screen incoming-call UI and join the same Agora
 * channel (`booking_<id>`) using its own agora-token request.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendFcmDataOnly, fcmProjectId } from "../_shared/fcmDataOnly.ts";
import {
  verifyFirebaseToken,
  extractToken,
  corsHeaders,
} from "../_shared/firebaseAuth.ts";

function cleanSecret(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim().replace(/^[']|[']$/g, "").replace(/^["]|["]$/g, "");
  const eq = v.indexOf("=");
  if (eq > -1 && v.slice(0, eq).includes("KEY")) {
    v = v.slice(eq + 1).trim().replace(/^[']|[']$/g, "").replace(/^["]|["]$/g, "");
  }
  return v;
}

const SUPABASE_URL =
  cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
  cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
  "https://paywwbuqycovjopryele.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
  cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY")) ||
  cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

const CALLABLE_STATUSES = new Set([
  "assigned", "confirmed", "on_the_way", "in_progress", "started", "accepted",
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Server configuration error" }, 500);
    }

    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Not authenticated" }, 401);
    const firebaseUser = await verifyFirebaseToken(idToken);

    const body = await req.json().catch(() => ({}));
    const booking_id = String(body?.booking_id || "").trim();
    const channel_name = String(body?.channel_name || `booking_${booking_id}`);
    if (!booking_id) return json({ error: "booking_id required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: caller } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("firebase_uid", firebaseUser.uid)
      .maybeSingle();
    if (!caller?.id) return json({ error: "Profile not found" }, 404);

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, user_id, worker_id, status, service_type")
      .eq("id", booking_id)
      .maybeSingle();
    if (!booking) return json({ error: "Booking not found" }, 404);

    if (booking.user_id !== caller.id) {
      return json({ error: "Not the booking customer" }, 403);
    }
    if (!booking.worker_id) {
      return json({ error: "No worker assigned" }, 409);
    }
    if (!CALLABLE_STATUSES.has(String(booking.status))) {
      return json({ error: `Calling not allowed in status ${booking.status}` }, 409);
    }

    // ---- Token discovery from BOTH sources ----------------------------------
    const tokenMap = new Map<string, string>(); // token -> source

    // Source 1: fcm_tokens table
    const { data: rows1, error: err1 } = await supabase
      .from("fcm_tokens")
      .select("token")
      .eq("user_id", booking.worker_id);
    if (err1) console.warn(`[notify-worker-call] fcm_tokens query error: ${err1.message}`);
    let src1 = 0;
    for (const r of (rows1 || [])) {
      const t = (r as any)?.token;
      if (t && !tokenMap.has(t)) { tokenMap.set(t, "fcm_tokens"); src1++; }
    }

    // Source 2: workers.fcm_token (Worker App's source of truth)
    let src2 = 0;
    const { data: worker, error: err2 } = await supabase
      .from("workers")
      .select("fcm_token, fcm_token_status")
      .eq("user_id", booking.worker_id)
      .maybeSingle();
    if (err2) console.warn(`[notify-worker-call] workers query error: ${err2.message}`);
    const wt = (worker as any)?.fcm_token;
    const wts = (worker as any)?.fcm_token_status;
    if (wt && wts !== "invalid" && !tokenMap.has(wt)) {
      tokenMap.set(wt, "workers.fcm_token");
      src2++;
    }

    console.log(
      `[notify-worker-call] worker_id=${booking.worker_id} fcm_tokens=${src1} workers.fcm_token=${src2} total=${tokenMap.size} project=${fcmProjectId()}`,
    );

    if (tokenMap.size === 0) {
      return json({ ok: true, sent: 0, message: "Worker has no devices registered" });
    }

    // ---- Data-only payload (strings only) -----------------------------------
    const customer_name = caller.full_name || "Customer";
    const data: Record<string, string> = {
      type: "incoming_call",
      booking_id: String(booking_id),
      channel_name,
      customer_name,
      caller_name: customer_name,
      service_type: String(booking.service_type || ""),
      title: "Incoming Call",
      body: "Customer is calling…",
    };

    let sent = 0;
    const results: Array<Record<string, unknown>> = [];
    for (const [token, source] of tokenMap.entries()) {
      try {
        const r = await sendFcmDataOnly(token, data);
        if (r.ok) sent++;
        results.push({ source, ok: r.ok, status: r.status, name: r.name, error: r.error });
        console.log(
          `[notify-worker-call] send source=${source} ok=${r.ok} status=${r.status || "-"} err=${r.error ? r.error.slice(0, 200) : "-"}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ source, ok: false, error: msg });
        console.warn(`[notify-worker-call] send threw source=${source} err=${msg}`);
      }
    }

    console.log(
      `[notify-worker-call] DONE booking_id=${booking_id} worker_id=${booking.worker_id} sent=${sent}/${tokenMap.size}`,
    );

    return json({
      ok: true,
      sent,
      total: tokenMap.size,
      channel_name,
      sources: { fcm_tokens: src1, workers_fcm_token: src2 },
      results,
    });
  } catch (err) {
    console.error("[notify-worker-call] fatal:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
