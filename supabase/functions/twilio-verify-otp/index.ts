// Verifies a Twilio Verify OTP for the given phone number; on success mints a
// Firebase Custom Token bound to deterministic uid = "phone:<E.164>".
// Client then calls signInWithCustomToken() to get a real Firebase session.

import { createFirebaseCustomToken, uidFromPhone } from "../_shared/firebaseCustomToken.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const VERIFY_SID = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

    if (!ACCOUNT_SID || !AUTH_TOKEN || !VERIFY_SID) {
      return json({ success: false, error: "Twilio not configured" }, 500);
    }

    const { phone, code } = await req.json().catch(() => ({}));
    if (!phone || !code) {
      return json({ success: false, error: "phone and code are required" }, 400);
    }

    const trimmed = String(phone).trim();
    if (!/^\+\d{8,15}$/.test(trimmed)) {
      return json({ success: false, error: "Invalid phone format" }, 400);
    }

    const url = `https://verify.twilio.com/v2/Services/${VERIFY_SID}/VerificationCheck`;
    const auth = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: trimmed, Code: String(code) }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[twilio-verify-otp] Twilio error", res.status, data);
      const message = data?.message || "Invalid or expired code";
      return json({ success: false, error: message }, 400);
    }

    if (data.status !== "approved") {
      console.warn("[twilio-verify-otp] Not approved", data.status);
      return json({ success: false, error: "Invalid verification code" }, 400);
    }

    // Mint Firebase Custom Token
    const uid = uidFromPhone(trimmed);
    let firebaseCustomToken: string;
    try {
      firebaseCustomToken = await createFirebaseCustomToken(uid, { phone_number: trimmed });
    } catch (e: any) {
      console.error("[twilio-verify-otp] Failed to mint custom token", e?.message);
      return json({ success: false, error: "Failed to create auth token" }, 500);
    }

    console.log("[twilio-verify-otp] OTP approved, custom token minted", { uid });
    return json({
      success: true,
      firebaseCustomToken,
      uid,
      phoneNumber: trimmed,
    });
  } catch (e: any) {
    console.error("[twilio-verify-otp] Exception", e?.message);
    return json({ success: false, error: e?.message || "Unexpected error" }, 500);
  }
});
