// Bootstrap profile via service role.
// Auth: Firebase ID token in x-firebase-token (or Authorization: Bearer ...)
// Action: ensures a profile row exists for the firebase_uid, optionally
// linking by phone and applying signup data. Always returns the profile.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

type SignupData = {
  fullName?: string;
  communityValue?: string;
  communityId?: string | null;
  buildingId?: string | null;
  flatId?: string | null;
  flatNo?: string;
};

type BootstrapRequest = {
  phone?: string;
  signupData?: SignupData | null;
};

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanSecret(raw?: string | null): string {
  if (!raw) return "";
  let value = raw.trim().replace(/^['"]|['"]$/g, "");
  const equalsIndex = value.indexOf("=");
  if (equalsIndex > -1 && value.slice(0, equalsIndex).includes("KEY")) {
    value = value.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const idToken = extractToken(req);
    if (!idToken) return jsonResponse({ error: "Missing Firebase token" }, 401);

    const fb = await verifyFirebaseToken(idToken);
    const firebaseUid = fb.uid;

    const payload = (await req.json().catch(() => ({}))) as BootstrapRequest;
    const phone = normalizePhone(payload.phone || fb.phone || "");
    const signup = payload.signupData || null;

    // Prefer explicit external DB env vars; fall back to defaults so the
    // function targets the project that actually owns `profiles` even when
    // deployed on Lovable Cloud (whose SUPABASE_URL points elsewhere).
    const supabaseUrl =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const serviceRoleKey =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY")) ||
      cleanSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[bootstrap-profile] Missing env");
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }
    console.log("[bootstrap-profile] using DB host:", new URL(supabaseUrl).host);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const SELECT_COLS =
      "id, full_name, phone, community, flat_no, is_admin, building_id, community_id, flat_id, firebase_uid";

    // 1) Lookup by firebase_uid
    const { data: byUid, error: byUidErr } = await admin
      .from("profiles")
      .select(SELECT_COLS)
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (byUidErr) {
      console.error("[bootstrap-profile] uid lookup error", byUidErr);
      return jsonResponse({ error: "Profile lookup failed" }, 500);
    }

    let profile = byUid;

    // 2) Fallback: link by phone
    if (!profile && phone) {
      const { data: byPhone } = await admin
        .from("profiles")
        .select(SELECT_COLS)
        .eq("phone", phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byPhone) {
        const { data: linked, error: linkErr } = await admin
          .from("profiles")
          .update({ firebase_uid: firebaseUid, phone })
          .eq("id", byPhone.id)
          .select(SELECT_COLS)
          .single();
        if (linkErr) {
          console.error("[bootstrap-profile] link error", linkErr);
          return jsonResponse({ error: "Profile link failed" }, 500);
        }
        profile = linked;
      }
    }

    // 3) Create new
    if (!profile) {
      const insertRow: Record<string, unknown> = {
        firebase_uid: firebaseUid,
        phone: phone || "",
        full_name: signup?.fullName || (phone || "User"),
        community: signup?.communityValue || "other",
        flat_no: signup?.flatNo || "",
        community_id: signup?.communityId ?? null,
        building_id: signup?.buildingId ?? null,
        flat_id: signup?.flatId ?? null,
      };

      const { data: created, error: insertErr } = await admin
        .from("profiles")
        .insert(insertRow)
        .select(SELECT_COLS)
        .single();

      if (insertErr) {
        // Possible race: another request just created the row
        if ((insertErr as any).code === "23505") {
          const { data: again } = await admin
            .from("profiles")
            .select(SELECT_COLS)
            .eq("firebase_uid", firebaseUid)
            .maybeSingle();
          if (again) {
            return jsonResponse({ profile: again });
          }
        }
        console.error("[bootstrap-profile] insert error", insertErr);
        return jsonResponse({ error: insertErr.message || "Profile create failed" }, 500);
      }
      profile = created;
    }

    // 4) Apply signup updates if provided (signup flow)
    if (signup && profile) {
      const updates: Record<string, unknown> = {};
      if (signup.fullName) updates.full_name = signup.fullName;
      if (signup.communityValue) updates.community = signup.communityValue;
      if (signup.flatNo) updates.flat_no = signup.flatNo;
      if (signup.communityId !== undefined) updates.community_id = signup.communityId;
      if (signup.buildingId !== undefined) updates.building_id = signup.buildingId;
      if (signup.flatId !== undefined) updates.flat_id = signup.flatId;

      if (Object.keys(updates).length > 0) {
        const { data: updated, error: updErr } = await admin
          .from("profiles")
          .update(updates)
          .eq("id", profile.id)
          .select(SELECT_COLS)
          .single();
        if (updErr) {
          console.error("[bootstrap-profile] update error", updErr);
        } else if (updated) {
          profile = updated;
        }
      }
    }

    // 5) Normalize phone if it changed
    if (profile && phone && profile.phone !== phone) {
      const { data: updated } = await admin
        .from("profiles")
        .update({ phone })
        .eq("id", profile.id)
        .select(SELECT_COLS)
        .single();
      if (updated) profile = updated;
    }

    return jsonResponse({ profile });
  } catch (err) {
    console.error("[bootstrap-profile] error", err);
    const msg = err instanceof Error ? err.message : "Bootstrap failed";
    return jsonResponse({ error: msg }, 500);
  }
});
