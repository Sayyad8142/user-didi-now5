// Lightweight phone existence check (service role) — used by Sign In tab so
// we can reject unregistered numbers BEFORE sending an OTP.
// Public (no auth) — only returns a boolean. Phone is normalized server-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-firebase-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const d = String(raw).replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  if (String(raw).startsWith("+")) return String(raw);
  return d ? `+${d}` : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Warmup ping
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("warmup") === "1") {
      return json({ ok: true, warm: true });
    }
  } catch {}

  try {
    const { phone } = await req.json().catch(() => ({}));
    const normalized = normalizePhone(phone);
    if (!normalized || !/^\+\d{8,15}$/.test(normalized)) {
      return json({ success: false, error: "Invalid phone" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Try a couple of common stored formats just in case.
    const digits = normalized.replace(/\D/g, "");
    const variants = Array.from(new Set([
      normalized,
      digits,
      digits.startsWith("91") ? digits.slice(2) : digits,
    ])).filter(Boolean);

    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .in("phone", variants)
      .limit(1);

    if (error) {
      console.error("[check-user-exists] query error", error.message);
      return json({ success: false, error: "Lookup failed" }, 500);
    }

    return json({ success: true, exists: Array.isArray(data) && data.length > 0 });
  } catch (e: any) {
    console.error("[check-user-exists] exception", e?.message);
    return json({ success: false, error: e?.message || "Unexpected error" }, 500);
  }
});
