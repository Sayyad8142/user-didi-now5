// Sends an OTP via Twilio Verify to the given phone number (E.164, +91...).
// Only sends to numbers that already exist in the `profiles` table.
// Uses raw Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

function cleanSecret(v: string | undefined | null): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

async function isPhoneRegistered(phone: string): Promise<boolean> {
  const supabaseUrl =
    cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
    cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
    "https://paywwbuqycovjopryele.supabase.co";
  const serviceRoleKey =
    cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
    cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY")) ||
    cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[twilio-send-otp] Missing Supabase env for registration check");
    // Fail-closed: do not send OTP if we cannot verify registration
    return false;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[twilio-send-otp] profile lookup failed", error);
    return false;
  }
  return !!data;
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

    // Gate: only send OTP to registered numbers
    const registered = await isPhoneRegistered(trimmed);
    if (!registered) {
      console.log("[twilio-send-otp] blocked unregistered number", trimmed);
      return json(
        {
          success: false,
          code: "not_registered",
          error: "This number isn't registered. Please contact support to create an account.",
        },
        403,
      );
    }

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

    console.log("[twilio-send-otp] OTP sent", { to: trimmed, status: data.status, sid: data.sid });
    return json({ success: true, status: data.status });
  } catch (e: any) {
    console.error("[twilio-send-otp] Exception", e?.message);
    return json({ success: false, error: e?.message || "Unexpected error" }, 500);
  }
});
