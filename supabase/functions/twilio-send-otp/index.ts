// Sends an OTP via Twilio Verify to the given phone number (E.164, +91...).
// Uses raw Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID)
// against verify.twilio.com directly.

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
      console.error("[twilio-send-otp] Missing Twilio configuration");
      return json({ success: false, error: "Twilio not configured" }, 500);
    }

    const { phone } = await req.json().catch(() => ({}));
    if (!phone || typeof phone !== "string") {
      return json({ success: false, error: "phone is required" }, 400);
    }

    // Basic E.164 validation
    const trimmed = phone.trim();
    if (!/^\+\d{8,15}$/.test(trimmed)) {
      return json({ success: false, error: "Invalid phone format. Use +91XXXXXXXXXX" }, 400);
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
