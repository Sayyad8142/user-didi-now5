// Sends an OTP via Zavu (WhatsApp Authentication template) and returns a
// stateless HMAC-signed verificationToken that the client must echo back to
// zavu-verify-otp. Mirrors the public response shape of twilio-send-otp as
// closely as possible, with one extra field (`verificationToken`).
//
// Required secrets:
//   ZAVU_API_KEY               - Bearer token for Zavu REST API
//   ZAVU_TEMPLATE_ID           - Approved Authentication template id (tmpl_...)
//   ZAVU_OTP_SIGNING_SECRET    - 32+ bytes, HMAC key for verification token
// Optional:
//   ZAVU_API_BASE              - default https://api.zavu.dev
//   ZAVU_OTP_TTL_SECONDS       - default 300 (5 minutes)
//   ZAVU_OTP_LENGTH            - default 6

import {
  corsHeaders,
  jsonResponse,
  generateOtp,
  normalizePhone,
  maskPhone,
  createVerificationToken,
  sendZavuOtpMessage,
} from "../_shared/zavuOtp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ZAVU_API_KEY") || "";
    const templateId = Deno.env.get("ZAVU_TEMPLATE_ID") || "";
    const signingSecret = Deno.env.get("ZAVU_OTP_SIGNING_SECRET") || "";
    const apiBase = Deno.env.get("ZAVU_API_BASE") || undefined;
    const ttlSeconds = Number(Deno.env.get("ZAVU_OTP_TTL_SECONDS") || "300");
    const otpLength = Number(Deno.env.get("ZAVU_OTP_LENGTH") || "6");

    if (!apiKey || !templateId || !signingSecret) {
      console.error("[zavu-send-otp] Missing Zavu configuration", {
        hasApiKey: !!apiKey,
        hasTemplateId: !!templateId,
        hasSigningSecret: !!signingSecret,
      });
      return jsonResponse({ success: false, error: "Zavu not configured" }, 500);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    if (!rawPhone) return jsonResponse({ success: false, error: "phone is required" }, 400);

    const phone = normalizePhone(rawPhone);
    if (!/^\+\d{8,15}$/.test(phone)) {
      return jsonResponse({ success: false, error: "Invalid phone format. Use +91XXXXXXXXXX" }, 400);
    }

    const code = generateOtp(otpLength);

    const send = await sendZavuOtpMessage({ apiKey, apiBase, templateId, to: phone, code });
    if (!send.ok) {
      console.error("[zavu-send-otp] Zavu send failed", {
        to: maskPhone(phone),
        status: send.status,
        error: send.error,
      });
      return jsonResponse({ success: false, error: send.error || "Failed to send OTP" }, 400);
    }

    const verificationToken = await createVerificationToken(signingSecret, phone, code, ttlSeconds);

    console.log("[zavu-send-otp] OTP sent", {
      to: maskPhone(phone),
      messageId: send.messageId,
      ttlSeconds,
    });

    // Shape mirrors twilio-send-otp ({ success, status }) plus extras.
    return jsonResponse({
      success: true,
      status: "pending",
      verificationToken,
      expiresIn: ttlSeconds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[zavu-send-otp] Exception", msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
