// Checks whether a profile exists for a given phone number.
// Public endpoint (no auth) — only returns a boolean, no PII.
// Tries multiple legacy phone formats to match older records.
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

function clean(raw?: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

function buildVariants(input: string): string[] {
  const digits = input.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  const set = new Set<string>();
  if (!last10) return [];
  set.add(`+91${last10}`);
  set.add(`91${last10}`);
  set.add(`0${last10}`);
  set.add(last10);
  set.add(input.trim());
  return Array.from(set).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { phone } = await req.json().catch(() => ({}));
    if (!phone || typeof phone !== "string") {
      return json({ success: false, error: "phone is required" }, 400);
    }

    const url =
      clean(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const key =
      clean(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!url || !key) return json({ success: false, error: "Backend not configured" }, 500);

    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const variants = buildVariants(phone);
    const last10 = phone.replace(/\D/g, "").slice(-10);

    // Exact-match against known variants
    const { data: exact, error: exactErr } = await admin
      .from("profiles")
      .select("id")
      .in("phone", variants)
      .limit(1);
    if (exactErr) {
      console.error("[check-phone-exists] exact lookup failed:", exactErr.message);
    }
    if (exact && exact.length > 0) {
      return json({ success: true, exists: true });
    }

    // Suffix fallback for unusual legacy formats
    if (last10) {
      const { data: suffix } = await admin
        .from("profiles")
        .select("id")
        .like("phone", `%${last10}`)
        .limit(1);
      if (suffix && suffix.length > 0) {
        return json({ success: true, exists: true });
      }
    }

    return json({ success: true, exists: false });
  } catch (e: any) {
    console.error("[check-phone-exists] exception:", e?.message);
    return json({ success: false, error: e?.message || "Unexpected error" }, 500);
  }
});
