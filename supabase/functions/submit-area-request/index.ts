// ============================================================================
// submit-area-request
// "Request Didi Now in Your Area" — stores a coverage request raised from the
// signup community step (Step 2) when the user's community is not listed yet.
//
// Runs with the service role against the EXTERNAL production DB so the Admin
// Panel can read the same table. Works unauthenticated (signup happens before
// the Firebase session exists); when a Firebase token IS present we resolve the
// profile id server-side and never trust a client-supplied user id.
//
// Duplicate protection: the same requester (profile id, else phone) asking for
// the same normalized area does not create a second row.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, corsHeaders } from "../_shared/firebaseAuth.ts";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";

const cors = { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return String(raw).trim() || null;
}

// Used only for duplicate detection — the original text is stored verbatim.
function normalizeArea(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const requestedArea = String(body?.requested_area ?? "").trim();
    const searchText = String(body?.search_text ?? "").trim() || null;
    const clientPhone = normalizePhone(body?.phone);

    if (!requestedArea) {
      return json({ error: "Please enter your community, area or PIN code" }, 400);
    }
    if (requestedArea.length > 300) {
      return json({ error: "That text is too long" }, 400);
    }

    const supabase = createClient(
      EXTERNAL_SUPABASE_URL,
      EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Optional identity: resolve profile server-side when a token is supplied.
    let profileId: string | null = null;
    let profilePhone: string | null = null;
    const token = req.headers.get("x-firebase-token") || "";
    if (token) {
      try {
        const decoded = await verifyFirebaseToken(token);
        const uid = decoded?.uid;
        if (uid) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, phone")
            .eq("firebase_uid", uid)
            .maybeSingle();
          if (profile?.id) {
            profileId = profile.id;
            profilePhone = normalizePhone(profile.phone);
          }
        }
      } catch (e) {
        console.warn("[submit-area-request] token ignored", (e as any)?.message);
      }
    }

    const phone = profilePhone || clientPhone;
    const normalizedArea = normalizeArea(requestedArea);

    // Store on the external production DB (Admin Panel source of truth). If the
    // table hasn't been created there yet (PGRST205), fall back to the Lovable
    // Cloud DB so no request is ever lost.
    const cloud = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const save = async (client: any) => {
      let dupQuery = client
        .from("service_area_requests")
        .select("id")
        .eq("normalized_area", normalizedArea)
        .limit(1);
      if (profileId) dupQuery = dupQuery.eq("profile_id", profileId);
      else if (phone) dupQuery = dupQuery.eq("phone", phone);
      else dupQuery = dupQuery.is("profile_id", null).is("phone", null);

      const { data: existing, error: dupError } = await dupQuery;
      if (dupError && String(dupError.code) === "PGRST205") {
        return { missingTable: true } as const;
      }
      if (existing && existing.length > 0) {
        return { duplicate: true, id: existing[0].id } as const;
      }

      const { data, error } = await client
        .from("service_area_requests")
        .insert({
          profile_id: profileId,
          phone,
          requested_area: requestedArea,
          normalized_area: normalizedArea,
          search_text: searchText,
          status: "New",
        })
        .select("id")
        .maybeSingle();

      if (error) {
        if (String(error.code) === "PGRST205") return { missingTable: true } as const;
        // Unique index race → treat as an accepted duplicate, never a failure.
        if (String(error.code) === "23505") return { duplicate: true, id: null } as const;
        return { error: `${error.code}: ${error.message}` } as const;
      }
      return { duplicate: false, id: data?.id ?? null } as const;
    };

    let store = "external";
    let result = await save(supabase);
    if ("missingTable" in result) {
      console.warn("[submit-area-request] external table missing → cloud fallback");
      store = "cloud";
      result = await save(cloud);
    }

    if ("missingTable" in result || "error" in result) {
      console.error("[submit-area-request] save failed", store, (result as any).error || "table missing");
      return json({ error: "Could not save your request. Please try again." }, 500);
    }

    console.log("[submit-area-request] saved", {
      store,
      id: result.id,
      duplicate: result.duplicate,
      hasProfile: !!profileId,
      hasPhone: !!phone,
    });
    return json({ ok: true, duplicate: !!result.duplicate, id: result.id ?? null, store });
  } catch (e: any) {
    console.error("[submit-area-request] unexpected", e?.message);
    return json({ error: "Unexpected error. Please try again." }, 500);
  }
});
