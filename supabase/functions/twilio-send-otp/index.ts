// Sends an OTP via Twilio Verify with per-phone + per-IP rate limiting.
// Rate limits stored in `otp_rate_limits` on external Supabase (profiles project).
// If the table is missing the function gracefully degrades (no rate limit, but still sends).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-firebase-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanSecret(raw?: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

// Rate limit policy:
//   - Same phone: max 1 request per 60s, max 5 per hour
//   - Same IP:   max 5 requests per hour (across all phones)
async function checkRateLimit(
  admin: ReturnType<typeof createClient> | null,
  phone: string,
  ip: string,
): Promise<{ ok: boolean; reason?: string; retryAfter?: number }> {
  if (!admin) return { ok: true };
  try {
    const now = Date.now();
    const oneMinuteAgo = new Date(now - 60_000).toISOString();
    const oneHourAgo = new Date(now - 3_600_000).toISOString();

    // 1) per-phone 60s cooldown
    const { data: recentPhone } = await admin
      .from("otp_rate_limits")
      .select("created_at")
      .eq("phone", phone)
      .gte("created_at", oneMinuteAgo)
      .order("created_at", { ascending: false })
      .limit(1);
    if (recentPhone && recentPhone.length > 0) {
      const last = new Date(recentPhone[0].created_at).getTime();
      const wait = Math.ceil((60_000 - (now - last)) / 1000);
      return { ok: false, reason: `Please wait ${wait}s before requesting another OTP`, retryAfter: wait };
    }

    // 2) per-phone hourly cap
    const { count: phoneCount } = await admin
      .from("otp_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", oneHourAgo);
    if ((phoneCount ?? 0) >= 5) {
      return { ok: false, reason: "Too many OTP requests for this number. Try again in an hour." };
    }

    // 3) per-IP hourly cap
    if (ip && ip !== "unknown") {
      const { count: ipCount } = await admin
        .from("otp_rate_limits")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", oneHourAgo);
      if ((ipCount ?? 0) >= 5) {
        return { ok: false, reason: "Too many OTP requests from this device. Try again in an hour." };
      }
    }

    return { ok: true };
  } catch (e) {
    console.warn("[twilio-send-otp] rate limit check failed (allowing):", (e as Error)?.message);
    return { ok: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const VERIFY_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

    if (!ACCOUNT_SID || !AUTH_TOKEN || !VERIFY_SID) {
      console.error("[twilio-send-otp] Missing Twilio configuration");
      return json({ success: false, error: "Twilio not configured" }, 500);
    }

    const { phone } = await req.json().catch(() => ({}));
    if (!phone || typeof phone !== "string") {
      return json({ success: false, error: "phone is required" }, 400);
    }

    const trimmed = phone.trim();
    if (!/^\+\d{8,15}$/.test(trimmed)) {
      return json({ success: false, error: "Invalid phone format. Use +91XXXXXXXXXX" }, 400);
    }

    // Rate limit (best-effort, uses external Supabase)
    const supabaseUrl =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const serviceRoleKey =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const admin = supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;

    const ip = getClientIp(req);
    const rate = await checkRateLimit(admin, trimmed, ip);
    if (!rate.ok) {
      console.warn("[twilio-send-otp] rate limited", { phone: trimmed, ip, reason: rate.reason });
      return json({ success: false, error: rate.reason || "Too many requests" }, 429);
    }

    // Send via Twilio Verify
    const url = `https://verify.twilio.com/v2/Services/${VERIFY_SID}/Verifications`;
    const auth = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: trimmed, Channel: "sms" }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[twilio-send-otp] Twilio error", res.status, data);
      const message = data?.message || "Failed to send OTP";
      return json({ success: false, error: message }, 400);
    }

    // Record the successful send for rate limiting
    if (admin) {
      admin.from("otp_rate_limits").insert({ phone: trimmed, ip }).then(({ error }) => {
        if (error) console.warn("[twilio-send-otp] failed to insert rate limit row:", error.message);
      });
    }

    console.log("[twilio-send-otp] OTP sent", { to: trimmed, status: data.status, sid: data.sid });
    return json({ success: true, status: data.status });
  } catch (e: any) {
    console.error("[twilio-send-otp] Exception", e?.message);
    return json({ success: false, error: e?.message || "Unexpected error" }, 500);
  }
});
