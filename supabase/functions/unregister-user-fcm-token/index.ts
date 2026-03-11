// ============================================================================
// unregister-user-fcm-token
// Removes the current user's FCM token from fcm_tokens on logout
// Accepts Firebase ID token in Authorization header
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
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const json = (await res.json()) as { keys: JsonWebKey[] };
  jwksCache = { keys: json.keys, cachedAtMs: now };
  return json.keys;
}

async function verifyFirebaseIdToken(idToken: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");

  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeJwtPart<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeJwtPart<FirebaseJwtPayload>(payloadB64);

  if (header.alg !== "RS256" || !header.kid) throw new Error("Bad JWT header");

  const keys = await getJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("No matching key");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["verify"],
  );

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    base64UrlToUint8Array(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) throw new Error("Signature invalid");

  if (!payload.iss?.startsWith("https://securetoken.google.com/")) throw new Error("Bad iss");
  const projectId = payload.iss.replace("https://securetoken.google.com/", "");
  if (payload.aud !== projectId) throw new Error("aud mismatch");

  const firebaseUid = payload.user_id ?? payload.sub;
  if (!firebaseUid) throw new Error("No uid");

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
        JSON.stringify({ ok: false, error: "Missing auth" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const fcmToken = body?.token as string | undefined;

    const { firebaseUid } = await verifyFirebaseIdToken(idToken);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (!profile?.id) {
      console.log("⚠️ No profile for uid:", firebaseUid);
      return new Response(
        JSON.stringify({ ok: true, deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let deleted = 0;

    // Delete by specific token if provided
    if (fcmToken) {
      const { data } = await supabase
        .from("fcm_tokens")
        .delete()
        .eq("user_id", profile.id)
        .eq("token", fcmToken)
        .select("user_id");
      deleted = data?.length ?? 0;
      console.log(`🗑️ Deleted ${deleted} token(s) by exact match for user ${profile.id}`);
    }

    // Fallback: delete all tokens for this user if no specific token or nothing matched
    if (deleted === 0) {
      const { data } = await supabase
        .from("fcm_tokens")
        .delete()
        .eq("user_id", profile.id)
        .select("user_id");
      deleted = data?.length ?? 0;
      console.log(`🗑️ Deleted ${deleted} token(s) by user_id for user ${profile.id}`);
    }

    return new Response(
      JSON.stringify({ ok: true, deleted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("❌ unregister error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
