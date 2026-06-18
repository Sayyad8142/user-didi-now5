/**
 * agora-token — Issue short-lived Agora RTC tokens for in-app voice calls.
 *
 * Channel: booking_<booking_id>
 * Only the booking's customer or assigned worker may receive a token.
 * Token TTL: 1 hour.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RtcTokenBuilder, RtcRole } from "npm:agora-token@2.0.5";
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

const AGORA_APP_ID = cleanSecret(Deno.env.get("AGORA_APP_ID"));
const AGORA_APP_CERTIFICATE = cleanSecret(Deno.env.get("AGORA_APP_CERTIFICATE"));

const SUPABASE_URL =
  cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
  cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
  "https://paywwbuqycovjopryele.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
  cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY")) ||
  cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

const TOKEN_TTL_SECONDS = 3600; // 1 hour

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Deterministically derive a stable 32-bit unsigned int UID from a string id. */
function uidFromString(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Agora UID must be a 32-bit unsigned int, non-zero.
  return h === 0 ? 1 : h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      console.error("[agora-token] missing Agora credentials");
      return json({ error: "Agora not configured" }, 500);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Server configuration error" }, 500);
    }

    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Not authenticated" }, 401);

    const firebaseUser = await verifyFirebaseToken(idToken);

    const body = await req.json().catch(() => ({}));
    const booking_id = String(body?.booking_id || "").trim();
    const requested_user_id = String(body?.user_id || "").trim();
    const role = String(body?.role || "").trim().toLowerCase();

    if (!booking_id) return json({ error: "booking_id required" }, 400);
    if (!requested_user_id) return json({ error: "user_id required" }, 400);
    if (role !== "customer" && role !== "worker") {
      return json({ error: "role must be 'customer' or 'worker'" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve caller's profile from Firebase UID
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .maybeSingle();

    if (!callerProfile?.id) {
      return json({ error: "Profile not found" }, 404);
    }

    // The caller can only request a token for themselves.
    if (callerProfile.id !== requested_user_id) {
      console.warn(
        `[agora-token] caller ${callerProfile.id} attempted token for ${requested_user_id}`,
      );
      return json({ error: "Forbidden" }, 403);
    }

    // Load booking and verify the caller is a participant in the claimed role.
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, user_id, worker_id, status")
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }

    const isCustomer = booking.user_id === callerProfile.id;
    const isAssignedWorker =
      booking.worker_id && booking.worker_id === callerProfile.id;

    if (role === "customer" && !isCustomer) {
      return json({ error: "Not the booking customer" }, 403);
    }
    if (role === "worker" && !isAssignedWorker) {
      return json({ error: "Not the assigned worker" }, 403);
    }
    if (!isCustomer && !isAssignedWorker) {
      return json({ error: "Not a participant of this booking" }, 403);
    }

    const channelName = `booking_${booking_id}`;
    const uid = uidFromString(callerProfile.id);
    const nowSec = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = nowSec + TOKEN_TTL_SECONDS;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs,
    );

    console.log(
      `[agora-token] issued booking_id=${booking_id} user_id=${callerProfile.id} role=${role} uid=${uid} channel=${channelName} ttl=${TOKEN_TTL_SECONDS}s`,
    );

    return json({
      appId: AGORA_APP_ID,
      channelName,
      token,
      uid,
      expiresIn: TOKEN_TTL_SECONDS,
    });
  } catch (err) {
    console.error("[agora-token] fatal:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
