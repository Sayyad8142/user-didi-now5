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

type ProfileUpdates = {
  full_name?: string;
  phone?: string;
  community?: string;
  community_id?: string | null;
  building_id?: string | null;
  flat_id?: string | null;
  flat_no?: string;
};

type BootstrapRequest = {
  phone?: string;
  signupData?: SignupData | null;
  profileUpdates?: ProfileUpdates | null;
};

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return raw;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

function isNotNullError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23502");
}

function missingPhoneFallback(firebaseUid: string): string {
  return `firebase:${firebaseUid}`;
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

// In-memory warmup metrics (per isolate)
let warmupCount = 0;
let lastWarmupAt = 0;
const bootedAt = Date.now();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Lightweight warmup path — no auth, no DB. Used by cron + manual pings to
  // keep the edge isolate hot. Triggered by:
  //   - GET  /functions/v1/bootstrap-profile
  //   - HEAD /functions/v1/bootstrap-profile
  //   - GET/POST with ?warmup=1
  const url = new URL(req.url);
  const isWarmupQuery = url.searchParams.get("warmup") === "1";
  if (req.method === "GET" || req.method === "HEAD" || isWarmupQuery) {
    const t0 = Date.now();
    warmupCount += 1;
    const wasCold = lastWarmupAt === 0;
    const sinceLast = lastWarmupAt ? t0 - lastWarmupAt : null;
    lastWarmupAt = t0;
    const ageMs = t0 - bootedAt;
    console.log(`[warmup] ok count=${warmupCount} ageMs=${ageMs} sinceLastMs=${sinceLast ?? "n/a"} cold=${wasCold} latencyMs=${Date.now() - t0}`);
    if (req.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { ...corsHeaders, "x-warmup": "ok", "x-isolate-age-ms": String(ageMs) },
      });
    }
    return jsonResponse({
      ok: true,
      warmup: true,
      isolate_age_ms: ageMs,
      warmup_count: warmupCount,
      since_last_ms: sinceLast,
      cold: wasCold,
      ts: new Date().toISOString(),
    });
  }

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const requestStart = Date.now();
  try {
    const idToken = extractToken(req);
    if (!idToken) return jsonResponse({ error: "Missing Firebase token" }, 401);

    const fb = await verifyFirebaseToken(idToken);
    const firebaseUid = fb.uid;

    const payload = (await req.json().catch(() => ({}))) as BootstrapRequest;
    const phone = normalizePhone(payload.phone || fb.phone || "");
    const signup = payload.signupData || null;
    const isCold = (Date.now() - bootedAt) < 5_000;
    console.log(`[bootstrap] start uid=${firebaseUid} cold=${isCold} isolate_age_ms=${Date.now() - bootedAt}`);

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
        phone: phone || null,
        full_name: signup?.fullName || (phone || "User"),
        community: signup?.communityValue || "other",
        flat_no: signup?.flatNo || "",
        community_id: signup?.communityId ?? null,
        building_id: signup?.buildingId ?? null,
        flat_id: signup?.flatId ?? null,
      };

      let { data: created, error: insertErr } = await admin
        .from("profiles")
        .insert(insertRow)
        .select(SELECT_COLS)
        .single();

      if (insertErr && isNotNullError(insertErr) && !phone) {
        const fallbackRow = { ...insertRow, phone: missingPhoneFallback(firebaseUid) };
        const retry = await admin
          .from("profiles")
          .insert(fallbackRow)
          .select(SELECT_COLS)
          .single();
        created = retry.data;
        insertErr = retry.error;
      }

      if (insertErr) {
        // Race / duplicate handling
        if (isDuplicateKeyError(insertErr)) {
          // First try to find the row by firebase_uid (uid race)
          const { data: againUid } = await admin
            .from("profiles")
            .select(SELECT_COLS)
            .eq("firebase_uid", firebaseUid)
            .maybeSingle();
          if (againUid) {
            profile = againUid;
          } else if (phone) {
            // Phone collided: an existing profile owns this phone.
            // Link it to this firebase_uid instead of failing.
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
              if (!linkErr && linked) profile = linked;
            }
          }
        }

        if (!profile) {
          console.error("[bootstrap-profile] insert error", insertErr);
          return jsonResponse({ error: insertErr.message || "Profile create failed" }, 500);
        }
      } else {
        profile = created;
      }
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

    // 6) Apply explicit profile updates from edit-profile flow
    const profileUpdates = payload.profileUpdates || null;
    if (profileUpdates && profile) {
      const updates: Record<string, unknown> = {};
      const allowed: (keyof ProfileUpdates)[] = [
        "full_name", "phone", "community", "community_id", "building_id", "flat_id", "flat_no",
      ];
      for (const k of allowed) {
        const v = profileUpdates[k];
        if (v !== undefined) updates[k] = v === "" && (k === "community_id" || k === "building_id" || k === "flat_id") ? null : v;
      }
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        const { data: updated, error: updErr } = await admin
          .from("profiles")
          .update(updates)
          .eq("id", profile.id)
          .select(SELECT_COLS)
          .single();
        if (updErr) {
          console.error("[bootstrap-profile] profileUpdates error", updErr);
          return jsonResponse({ error: updErr.message || "Profile update failed" }, 500);
        }
        if (!updated) {
          return jsonResponse({ error: "No profile row updated" }, 404);
        }
        profile = updated;
      }
    }

    console.log(`[bootstrap] done cold=${isCold} totalMs=${Date.now() - requestStart}`);
    return jsonResponse({ profile });
  } catch (err) {
    console.error("[bootstrap-profile] error", err);
    const msg = err instanceof Error ? err.message : "Bootstrap failed";
    return jsonResponse({ error: msg }, 500);
  }
});
