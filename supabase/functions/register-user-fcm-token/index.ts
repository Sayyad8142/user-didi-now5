// ============================================================================
// register-user-fcm-token
// Securely registers a device FCM token for the currently signed-in Firebase user
// - Client sends Firebase ID token in Authorization header
// - Function verifies token signature via Google's JWKS
// - Maps firebase uid -> profiles.id
// - Upserts into public.user_fcm_tokens using service role
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  // Validate issuer format (must be securetoken.google.com/<project>)
  if (!payload.iss || !payload.iss.startsWith("https://securetoken.google.com/")) {
    throw new Error("JWT iss invalid");
  }

  // Extract project ID from issuer
  const projectId = payload.iss.replace("https://securetoken.google.com/", "");

  // Validate aud matches the project from iss
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
    const idToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : null;

    if (!idToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing Authorization bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const fcmToken = body?.token as string | undefined;
    const deviceInfo = body?.device_info ?? null;

    if (!fcmToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { firebaseUid } = await verifyFirebaseIdToken(idToken);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (profileError) {
      console.error("❌ profiles lookup failed:", profileError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to lookup profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!profile?.id) {
      console.log("⚠️ No profile for firebase_uid:", firebaseUid);
      return new Response(
        JSON.stringify({ ok: false, error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("📥 Registering user FCM token", {
      profile_id: profile.id,
      token_preview: `${fcmToken.slice(0, 12)}...`,
    });

    const { error: upsertError } = await supabase
      .from("user_fcm_tokens")
      .upsert(
        {
          user_id: profile.id,
          token: fcmToken,
          device_info: deviceInfo,
        },
        { onConflict: "token" },
      );

    if (upsertError) {
      console.error("❌ user_fcm_tokens upsert failed:", upsertError);
      return new Response(
        JSON.stringify({ ok: false, error: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
