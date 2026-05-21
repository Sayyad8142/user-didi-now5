import { supabase } from "@/integrations/supabase/client";

export function normalizePhone(raw?: string | null) {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw;
}

/** Wait until Supabase session exists (handles OTP race). */
export async function waitForSession(timeoutMs = 5000) {
  const start = Date.now();
  // also refresh once to speed up session availability
  await supabase.auth.getSession();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase.auth.getUser();
    if (data.user) return data.user;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("Session not ready after OTP");
}

/**
 * Ensure a profile row exists for current auth user.
 * - Idempotent upsert on id
 * - Normalizes phone to +91XXXXXXXXXX
 * - Returns the profile
 * - Throws with detailed error if RLS/policies block it
 */
/**
 * @deprecated Direct profile creation from the client is disabled.
 * All profile create / link / update flows MUST go through the
 * `bootstrap-profile` edge function (service-role) so that signup intent and
 * full_name validation are enforced server-side. Calling this throws on
 * purpose to surface any remaining usage.
 *
 * `normalizePhone` above is still used by AuthCard / VerifyOTP / ProfileContext.
 */
export async function ensureProfile(): Promise<never> {
  throw new Error(
    "ensureProfile() is deprecated. Use the bootstrap-profile edge function via ProfileContext / signup flow.",
  );
}