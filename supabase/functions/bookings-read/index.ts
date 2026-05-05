// Edge function: bookings-read
// Returns the authenticated user's bookings via service role (bypasses RLS).
// The Supabase JS client in the app is anonymous (Firebase identity), so it
// cannot read RLS-protected bookings directly. This proxy verifies the
// Firebase ID token, maps to the profile id, and returns bookings owned by
// that profile.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanSecret(raw?: string | null): string {
  if (!raw) return "";
  let value = raw.trim().replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "");
  const equalsIndex = value.indexOf("=");
  if (equalsIndex > -1 && value.slice(0, equalsIndex).includes("KEY")) {
    value = value.slice(equalsIndex + 1).trim().replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "");
  }
  return value;
}

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const idToken = extractToken(req);
    if (!idToken) return jsonResponse({ error: "Missing Firebase token" }, 401);

    const fb = await verifyFirebaseToken(idToken);
    const phone = normalizePhone(fb.phone || "");

    const supabaseUrl =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const serviceRoleKey =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY")) ||
      cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("firebase_uid", fb.uid)
      .maybeSingle();

    if (profileError) {
      console.error("[bookings-read] Profile lookup failed", profileError);
      return jsonResponse({ error: "Failed to load profile" }, 500);
    }

    if (!profile?.id && phone) {
      const { data: byPhone, error: phoneError } = await admin
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (phoneError) {
        console.error("[bookings-read] Phone lookup failed", phoneError);
        return jsonResponse({ error: "Failed to load profile" }, 500);
      }
      profile = byPhone;
      if (profile?.id) {
        await admin.from("profiles").update({ firebase_uid: fb.uid, phone }).eq("id", profile.id);
      }
    }

    if (!profile?.id) return jsonResponse({ bookings: [] });

    let limit = 50;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.limit === "number" && body.limit > 0 && body.limit <= 200) {
        limit = body.limit;
      }
    }

    const { data, error } = await admin
      .from("bookings")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[bookings-read] Query failed", error);
      return jsonResponse({ error: "Failed to load bookings" }, 500);
    }

    return jsonResponse({ bookings: data ?? [] });
  } catch (err) {
    console.error("[bookings-read] Unhandled error", err);
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500);
  }
});
