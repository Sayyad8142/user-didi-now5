// ============================================================================
// register-user-fcm-token
// Securely registers a device FCM token for the currently signed-in Firebase user
// - Client sends Firebase ID token in Authorization header
// - Function verifies token signature via Google's JWKS
// - Maps firebase uid -> profiles.id
// - Upserts into public.fcm_tokens using service role
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-app-version, x-app-platform",
};

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

type FirebaseJwtPayload = {
  aud?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  user_id?: string;
};

let jwksCache: { keys: JsonWebKey[]; cachedAtMs: number } | null = null;

function base64UrlToUint8Array(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (input.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function decodeJwtPart<T>(part: string): T {
  const bytes = base64UrlToUint8Array(part);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as T;
}

async function getJwks(): Promise<JsonWebKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.cachedAtMs < 1000 * 60 * 30) {
    return jwksCache.keys;
  }

  const res = await fetch(JWKS_URL);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to fetch JWKS (${res.status}): ${t}`);
  }

  const json = (await res.json()) as { keys: JsonWebKey[] };
  jwksCache = { keys: json.keys, cachedAtMs: now };
  return json.keys;
}

async function verifyFirebaseIdToken(idToken: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const [headerB64, payloadB64, sigB64] = parts;

  const header = decodeJwtPart<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeJwtPart<FirebaseJwtPayload>(payloadB64);

  if (header.alg !== "RS256") throw new Error("Unsupported JWT alg");
  if (!header.kid) throw new Error("Missing JWT kid");

  const keys = await getJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("No matching public key for kid");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(sigB64);

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature,
    signingInput,
  );

  if (!ok) throw new Error("JWT signature verification failed");

  const nowSec = Math.floor(Date.now() / 1000);

  if (!payload.iss || !payload.iss.startsWith("https://securetoken.google.com/")) {
    throw new Error("JWT iss invalid");
  }

  const projectId = payload.iss.replace("https://securetoken.google.com/", "");

  if (payload.aud !== projectId) throw new Error("JWT aud/iss mismatch");

  if (!payload.exp || payload.exp <= nowSec) throw new Error("JWT expired");

  const firebaseUid = payload.user_id ?? payload.sub;
  if (!firebaseUid) throw new Error("JWT missing user id");

  console.log("✅ Firebase token verified for uid:", firebaseUid, "project:", projectId);

  return { firebaseUid };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;
    const headerToken = req.headers.get("x-firebase-token");
    // Some clients send the Supabase publishable key as the bearer and the
    // Firebase ID token in x-firebase-token — accept either.
    const idToken = (headerToken && headerToken.split(".").length === 3)
      ? headerToken
      : bearer;

    if (!idToken) {
      return new Response(
        JSON.stringify({ ok: false, stage: "auth", error: "Missing Authorization bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const fcmToken = body?.token as string | undefined;
    const deviceInfo = body?.device_info ?? null;

    if (!fcmToken) {
      return new Response(
        JSON.stringify({ ok: false, stage: "input", error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let firebaseUid: string;
    try {
      ({ firebaseUid } = await verifyFirebaseIdToken(idToken));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("❌ Firebase token verification failed:", msg);
      return new Response(
        JSON.stringify({ ok: false, stage: "verify", error: msg }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // profiles / user_fcm_tokens live on the external project — never on the
    // Lovable-injected DB. Using SUPABASE_URL here made every call fail with
    // "Profile not found" once the client started calling Lovable Cloud.
    const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);
    console.log("[register-user-fcm-token] DB host:", new URL(EXTERNAL_SUPABASE_URL).host);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (profileError) {
      console.error("❌ profiles lookup failed:", profileError);
      return new Response(
        JSON.stringify({ ok: false, stage: "profile_lookup", error: profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!profile?.id) {
      console.log("⚠️ No profile for firebase_uid:", firebaseUid);
      return new Response(
        JSON.stringify({ ok: false, stage: "profile_lookup", error: `Profile not found for uid ${firebaseUid}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    const platform =
      (deviceInfo && typeof deviceInfo === 'object' && (deviceInfo as any).platform) ||
      null;

    // Guard: a raw APNs device token is 64 hex chars and is NOT usable with the
    // FCM HTTP v1 API. Reject it instead of storing an undeliverable row.
    // (Existing rows are left untouched — cleanup is a separate step.)
    if (String(platform).toLowerCase() === 'ios' && /^[0-9a-f]{64}$/i.test(fcmToken.trim())) {
      console.warn('⚠️ Rejecting raw APNs device token for iOS — expected an FCM registration token');
      return new Response(
        JSON.stringify({ ok: false, error: 'Raw APNs device token rejected; FCM registration token required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    console.log("📥 Registering user FCM token", {
      profile_id: profile.id,
      platform: platform || 'unknown',
      token_preview: `${fcmToken.slice(0, 12)}...`,
    });

    // User tokens belong in user_fcm_tokens, whose user_id FK references
    // profiles.id. The legacy fcm_tokens table belongs to public.users and
    // cannot represent Firebase-only users.
    await supabase
      .from("user_fcm_tokens")
      .delete()
      .eq("token", fcmToken)
      .neq("user_id", profile.id);

    // Preserve the existing one-token-per-user behavior without depending on
    // a legacy table constraint: replace this profile's current row, then add
    // the freshly issued FCM token.
    const { error: deleteCurrentError } = await supabase
      .from("user_fcm_tokens")
      .delete()
      .eq("user_id", profile.id);

    if (deleteCurrentError) {
      console.error("❌ user_fcm_tokens cleanup failed:", deleteCurrentError);
      return new Response(
        JSON.stringify({ ok: false, stage: "token_cleanup", error: deleteCurrentError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const basePayload: Record<string, unknown> = {
      user_id: profile.id,
      token: fcmToken,
      device_info: deviceInfo,
      updated_at: new Date().toISOString(),
    };
    if (platform) basePayload.platform = String(platform).toLowerCase();

    const { error: upsertError } = await supabase
      .from("user_fcm_tokens")
      .insert(basePayload);

    if (upsertError) {
      console.error("❌ user_fcm_tokens insert failed:", upsertError);
      return new Response(
        JSON.stringify({ ok: false, stage: "token_insert", error: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`✅ FCM token registered for user: ${profile.id} (platform=${platform || 'unknown'})`);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("❌ register-user-fcm-token error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
