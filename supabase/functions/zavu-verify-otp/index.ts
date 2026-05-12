// Verifies an OTP previously sent via zavu-send-otp using the stateless
// HMAC-signed verificationToken. On success, mints a Firebase Custom Token
// bound to the SAME deterministic uid as the Twilio flow:
//   uid = "phone:<E.164>"
// so existing profile rows linked by firebase_uid keep working.
//
// Request:  { phone: string, code: string, verificationToken: string }
// Response (mirrors twilio-verify-otp): { success, firebaseCustomToken, uid, phoneNumber }
//
// Required secrets (in addition to Zavu ones from send):
//   ZAVU_OTP_SIGNING_SECRET    - same value as zavu-send-otp uses
//   FIREBASE_SERVICE_ACCOUNT (or FCM_PROJECT_ID + FCM_CLIENT_EMAIL + FCM_PRIVATE_KEY)
//                              - same secret already used by twilio-verify-otp

import {
  corsHeaders,
  jsonResponse,
  normalizePhone,
  maskPhone,
  verifyVerificationToken,
} from "../_shared/zavuOtp.ts";
import { createFirebaseCustomToken, uidFromPhone } from "../_shared/firebaseCustomToken.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const signingSecret = Deno.env.get("ZAVU_OTP_SIGNING_SECRET") || "";
    if (!signingSecret) {
      console.error("[zavu-verify-otp] Missing ZAVU_OTP_SIGNING_SECRET");
      return jsonResponse({ success: false, error: "Zavu not configured" }, 500);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const verificationToken = typeof body.verificationToken === "string" ? body.verificationToken : "";

    if (!rawPhone || !code || !verificationToken) {
      return jsonResponse(
        { success: false, error: "phone, code and verificationToken are required" },
        400,
      );
    }

    const phone = normalizePhone(rawPhone);
    if (!/^\+\d{8,15}$/.test(phone)) {
      return jsonResponse({ success: false, error: "Invalid phone format" }, 400);
    }
    if (!/^\d{4,8}$/.test(code)) {
      return jsonResponse({ success: false, error: "Invalid verification code" }, 400);
    }

    const result = await verifyVerificationToken(signingSecret, verificationToken, phone, code);
    if (!result.ok) {
      console.warn("[zavu-verify-otp] verification rejected", {
        to: maskPhone(phone),
        reason: result.error,
      });
      const userMsg =
        result.error === "expired"
          ? "Verification code expired. Please request a new one."
          : "Invalid verification code";
      return jsonResponse({ success: false, error: userMsg }, 400);
    }

    const uid = uidFromPhone(phone);
    let firebaseCustomToken: string;
    try {
      firebaseCustomToken = await createFirebaseCustomToken(uid, { phone_number: phone });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "mint failed";
      console.error("[zavu-verify-otp] Failed to mint custom token", msg);
      return jsonResponse({ success: false, error: "Failed to create auth token" }, 500);
    }

    console.log("[zavu-verify-otp] OTP approved, custom token minted", {
      to: maskPhone(phone),
      uid,
    });

    return jsonResponse({
      success: true,
      firebaseCustomToken,
      uid,
      phoneNumber: phone,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[zavu-verify-otp] Exception", msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
