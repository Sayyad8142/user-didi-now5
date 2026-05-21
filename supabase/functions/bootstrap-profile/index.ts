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
  mode?: 'signin' | 'signup' | null;
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
    const mode = payload.mode || (signup ? 'signup' : null); // null = legacy / profileUpdates-only call
    const isCold = (Date.now() - bootedAt) < 5_000;
    console.log(`[bootstrap] start uid=${firebaseUid} mode=${mode} cold=${isCold} isolate_age_ms=${Date.now() - bootedAt}`);


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
    let matchSource: 'uid' | 'phone_exact' | 'phone_variant' | 'created' | 'none' | 'stub_recovered' = byUid ? 'uid' : 'none';

    // 1.5) Stub-recovery: if uid match returned a stub (default name, no flat,
    // community 'other') AND we have a phone, look for a real profile by phone
    // and reassign the firebase_uid to it. Fixes race where a parallel
    // bootstrap call (with empty phone) created a default profile while
    // another call linked the real profile.
    if (profile && phone) {
      const isStub =
        (!profile.full_name || profile.full_name === "User" || profile.full_name === phone) &&
        (!profile.flat_no || profile.flat_no === "") &&
        (profile.community === "other" || !profile.community);
      if (isStub) {
        const digits = phone.replace(/\D/g, "");
        const last10 = digits.slice(-10);
        const variants = Array.from(new Set([
          phone, `+${digits}`, digits, last10,
          `+91${last10}`, `91${last10}`, `0${last10}`, `+91 ${last10}`, `91 ${last10}`,
        ].filter(Boolean)));
        const { data: realCandidates } = await admin
          .from("profiles")
          .select(SELECT_COLS)
          .in("phone", variants)
          .neq("id", profile.id)
          .order("updated_at", { ascending: false })
          .limit(5);
        const real = (realCandidates || []).find((r: any) =>
          r.full_name && r.full_name !== "User" && r.full_name !== phone &&
          (r.flat_no || r.community !== "other")
        );
        if (real) {
          console.log(`[bootstrap] stub recovery: stub=${profile.id} → real=${real.id} (oldUid=${real.firebase_uid})`);
          // Free uid on stub, then attach to real.
          await admin.from("profiles").update({ firebase_uid: `stub:${profile.id}` }).eq("id", profile.id);
          const { data: linked, error: linkErr } = await admin
            .from("profiles")
            .update({ firebase_uid: firebaseUid, phone })
            .eq("id", real.id)
            .select(SELECT_COLS)
            .single();
          if (!linkErr && linked) {
            profile = linked;
            matchSource = 'stub_recovered';
          } else if (linkErr) {
            console.error("[bootstrap] stub recovery link failed", linkErr);
            // Restore uid on stub so user isn't locked out
            await admin.from("profiles").update({ firebase_uid: firebaseUid }).eq("id", profile.id);
          }
        }
      }
    }

    // 2) Fallback: link by phone — try multiple legacy formats so old Firebase
    // users (whose phone may be stored as 9000666986, 919000666986, with
    // spaces, etc.) get matched to their existing profile instead of getting
    // a fresh default one.
    if (!profile && phone) {
      const digits = phone.replace(/\D/g, ""); // e.g. "919000666986"
      const last10 = digits.slice(-10);         // e.g. "9000666986"
      const variants = Array.from(new Set([
        phone,                  // +91XXXXXXXXXX
        `+${digits}`,           // +91XXXXXXXXXX
        digits,                 // 91XXXXXXXXXX
        last10,                 // XXXXXXXXXX
        `+91${last10}`,
        `91${last10}`,
        `0${last10}`,
        `+91 ${last10}`,
        `91 ${last10}`,
      ].filter(Boolean)));

      // First try exact normalized match
      const { data: byPhoneExact } = await admin
        .from("profiles")
        .select(SELECT_COLS)
        .eq("phone", phone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let matched = byPhoneExact;
      if (matched) {
        matchSource = 'phone_exact';
      } else {
        // Try the other variants via IN(...)
        const { data: byVariants } = await admin
          .from("profiles")
          .select(SELECT_COLS)
          .in("phone", variants)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byVariants) {
          matched = byVariants;
          matchSource = 'phone_variant';
        } else {
          // Last resort: strip whitespace and compare last-10-digit suffix server-side
          const { data: bySuffix } = await admin
            .from("profiles")
            .select(SELECT_COLS)
            .like("phone", `%${last10}`)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (bySuffix) {
            matched = bySuffix;
            matchSource = 'phone_variant';
          }
        }
      }

      if (matched) {
        console.log(`[bootstrap] phone match found id=${matched.id} oldPhone=${matched.phone} oldUid=${matched.firebase_uid} via=${matchSource}`);
        const { data: linked, error: linkErr } = await admin
          .from("profiles")
          .update({ firebase_uid: firebaseUid, phone })
          .eq("id", matched.id)
          .select(SELECT_COLS)
          .single();
        if (linkErr) {
          console.error("[bootstrap-profile] link error", linkErr);
          return jsonResponse({ error: "Profile link failed" }, 500);
        }
        profile = linked;
      }
    }

    console.log(`[bootstrap] lookup result uid=${firebaseUid} phone=${phone} matchSource=${matchSource} profileId=${profile?.id ?? 'none'}`);

    // 2.5) Intent enforcement
    //   - signup + existing profile  => block, do not overwrite
    //   - signin + no profile        => block, do not auto-create stub accounts
    //   - null mode + no profile     => block (legacy auto-call from
    //     ProfileContext on Firebase auth-state change). Auto-creating here
    //     produced stub profiles named "+91XXXXXXXXXX" that races with the
    //     explicit signup call and made the admin show "User <last4>".
    //   - signup WITHOUT a real fullName => block (must come from the wizard)
    if (mode === 'signup' && profile) {
      console.warn(`[bootstrap] signup blocked: profile already exists id=${profile.id}`);
      return jsonResponse({
        error: 'Account already exists. Please sign in.',
        code: 'account_exists',
      }, 409);
    }
    if (mode === 'signin' && !profile) {
      console.warn(`[bootstrap] signin blocked: no profile for uid=${firebaseUid} phone=${phone}`);
      return jsonResponse({
        error: 'Account not found. Please sign up first.',
        code: 'account_not_found',
      }, 404);
    }
    if (mode === null && !profile) {
      console.warn(`[bootstrap] legacy no-mode call blocked (would create stub) uid=${firebaseUid} phone=${phone}`);
      return jsonResponse({
        error: 'Account not found. Please sign up first.',
        code: 'account_not_found',
      }, 404);
    }
    if (mode === 'signup' && (!signup?.fullName || !signup.fullName.trim() || /^\+?\d{7,15}$/.test(signup.fullName.trim()))) {
      console.warn(`[bootstrap] signup blocked: missing/invalid fullName uid=${firebaseUid}`);
      return jsonResponse({
        error: 'A valid full name is required to create an account.',
        code: 'invalid_signup_data',
      }, 400);
    }

    // 3) Create new — only reached when mode='signup' AND no existing profile
    // AND signup.fullName is a real, validated name.
    if (!profile) {
      const insertRow: Record<string, unknown> = {
        firebase_uid: firebaseUid,
        phone: phone || null,
        // NEVER fall back to phone-as-name. If signup.fullName is somehow
        // missing here (guarded above), use empty string so the UI prompts
        // the user instead of producing a stub name that booking screens
        // would render as "User <last4>".
        full_name: (signup?.fullName && signup.fullName.trim()) || "",
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
        if (isDuplicateKeyError(insertErr)) {
          // Race: another request created/linked the row. Re-resolve.
          const { data: againUid } = await admin
            .from("profiles")
            .select(SELECT_COLS)
            .eq("firebase_uid", firebaseUid)
            .maybeSingle();
          if (againUid) {
            profile = againUid;
          } else if (phone) {
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
        matchSource = 'created';
        console.log(`[bootstrap] created new profile id=${profile?.id} uid=${firebaseUid} phone=${phone} name="${insertRow.full_name}"`);
      }
    }

    // 4) Apply signup updates if provided (signup flow)
    if (signup && profile) {
      const updates: Record<string, unknown> = {};
      if (signup.fullName) {
        const trimmed = signup.fullName.trim();
        // Never persist phone-shaped values, the literal "User", or empty as full_name.
        if (trimmed && !/^\+?\d{7,15}$/.test(trimmed) && trimmed.toLowerCase() !== "user") {
          updates.full_name = trimmed;
        } else {
          console.warn(`[bootstrap] dropped invalid signup.fullName="${signup.fullName}" for id=${profile.id}`);
        }
      }
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
        if (v === undefined) continue;
        if (k === "full_name") {
          const trimmed = typeof v === "string" ? v.trim() : "";
          if (!trimmed) {
            return jsonResponse({ error: "Full name cannot be empty.", code: "invalid_full_name" }, 400);
          }
          if (/^\+?\d{7,15}$/.test(trimmed) || trimmed.toLowerCase() === "user") {
            return jsonResponse({ error: "Please enter your real name.", code: "invalid_full_name" }, 400);
          }
          updates[k] = trimmed;
          continue;
        }
        updates[k] = v === "" && (k === "community_id" || k === "building_id" || k === "flat_id") ? null : v;
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
