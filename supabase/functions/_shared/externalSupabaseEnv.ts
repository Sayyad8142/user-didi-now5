/**
 * Shared resolver for the EXTERNAL Supabase DB credentials.
 *
 * The app runs a hybrid backend: Edge Functions live on Lovable Cloud,
 * but the actual data (bookings, pending_bookings, orphan_payments,
 * profiles, user_wallets, ...) lives on the external Supabase project
 * (paywwbuqycovjopryele.supabase.co / api.didisnow.com).
 *
 * Any edge function that reads/writes those tables MUST use these
 * credentials — NOT the Lovable-injected SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY, which point at the Lovable Cloud DB and
 * will return "Could not find the table 'public.<x>' in the schema
 * cache" errors.
 */

function cleanSecret(raw?: string | null): string {
  if (!raw) return "";
  let value = raw.trim().replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "");
  const equalsIndex = value.indexOf("=");
  if (equalsIndex > -1 && value.slice(0, equalsIndex).includes("KEY")) {
    value = value
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^[']|[']$/g, "")
      .replace(/^[\"]|[\"]$/g, "");
  }
  return value;
}

export const EXTERNAL_SUPABASE_URL: string =
  cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
  cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
  "https://paywwbuqycovjopryele.supabase.co";

export const EXTERNAL_SUPABASE_SERVICE_ROLE_KEY: string =
  cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
  cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY")) ||
  cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

/**
 * URL to reach Lovable-Cloud-hosted edge functions (dispatch, send-fcm, ...).
 * These functions are deployed on Lovable Cloud, NOT on the external project.
 */
export const FUNCTIONS_BASE_URL: string =
  cleanSecret(Deno.env.get("FUNCTIONS_BASE_URL")) ||
  cleanSecret(Deno.env.get("SUPABASE_URL")) ||
  "";
