/**
 * notify-worker-call — Customer-initiated ring of the assigned worker.
 *
 * Verifies the caller is the booking's customer, then pushes a
 * high-priority FCM data message to the worker so the worker app can
 * present its full-screen incoming-call UI and join the same Agora
 * channel (`booking_<id>`) using its own agora-token request.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendFcmV1Message } from "../_shared/fcmV1.ts";
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

    // Fetch worker FCM tokens
    const { data: tokens } = await supabase
      .from("fcm_tokens")
      .select("token")
      .eq("user_id", booking.worker_id);

    const tokenList = (tokens || []).map((t: any) => t.token).filter(Boolean);
    if (tokenList.length === 0) {
      console.warn(`[notify-worker-call] no FCM tokens for worker ${booking.worker_id}`);
      return json({ ok: true, sent: 0, message: "Worker has no devices registered" });
    }

    const data = {
      type: "incoming_call",
      booking_id: String(booking_id),
      channel_name,
      caller_name: caller.full_name || "Customer",
      service_type: booking.service_type || "",
    };

    let sent = 0;
    for (const token of tokenList) {
      try {
        await sendFcmV1Message(token, "Incoming Call", "Customer is calling…", data);
        sent++;
      } catch (e) {
        console.warn("[notify-worker-call] FCM send failed", e);
      }
    }

    console.log(
      `[notify-worker-call] booking_id=${booking_id} worker_id=${booking.worker_id} sent=${sent}/${tokenList.length}`,
    );

    return json({ ok: true, sent, total: tokenList.length, channel_name });
  } catch (err) {
    console.error("[notify-worker-call] fatal:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
