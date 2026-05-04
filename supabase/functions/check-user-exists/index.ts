// Checks if a phone number is already registered (profiles table).
// Uses the service role key to bypass RLS. Public endpoint (no auth required).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

function normalize(raw: string): string[] {
  const trimmed = (raw || "").replace(/\s+/g, "");
  const digits = trimmed.replace(/\D/g, "");
  const variants = new Set<string>();
  if (trimmed.startsWith("+")) variants.add(trimmed);
  if (digits.length === 10) {
    variants.add(`+91${digits}`);
    variants.add(digits);
    variants.add(`91${digits}`);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    variants.add(`+${digits}`);
    variants.add(digits);
    variants.add(digits.slice(2));
  } else if (digits.length > 0) {
    variants.add(digits);
  }
  return Array.from(variants);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Hard-code production URL — reserved env SUPABASE_URL may point to the
    // wrong project in some runtimes. Service role secret is set to production.
    const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SERVICE_ROLE) {
      return json({ exists: false, error: "Server not configured" }, 500);
    }

    const { phone } = await req.json().catch(() => ({}));
    if (!phone || typeof phone !== "string") {
      return json({ exists: false, error: "phone is required" }, 400);
    }

    const variants = normalize(phone);
    if (variants.length === 0) {
      return json({ exists: false, error: "invalid phone" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .in("phone", variants)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[check-user-exists] DB error", error.message);
      return json({ exists: false, error: error.message }, 500);
    }

    return json({ exists: !!data });
  } catch (e: any) {
    console.error("[check-user-exists] Exception", e?.message);
    return json({ exists: false, error: e?.message || "Unexpected error" }, 500);
  }
});
