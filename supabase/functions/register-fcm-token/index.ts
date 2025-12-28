// ============================================================================
// register-fcm-token
// Securely upsert/check a user's FCM token using Firebase ID token verification
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "upsert" | "exists";

interface Payload {
  firebase_id_token?: string;
  action?: Action;
  fcm_token?: string;
  device_info?: string;
}

const FIREBASE_PROJECT_ID = "didinowusernew";

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string }> {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log("❌ Firebase tokeninfo failed:", res.status, text.slice(0, 200));
    throw new Error("Invalid Firebase session");
  }

  const claims = await res.json();
  const aud = claims.aud as string | undefined;
  const iss = claims.iss as string | undefined;
  const sub = claims.sub as string | undefined;

  if (!sub) throw new Error("Invalid Firebase session");
  if (aud !== FIREBASE_PROJECT_ID) throw new Error("Invalid Firebase session");
  if (iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error("Invalid Firebase session");

  return { uid: sub };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: Payload = await req.json();

    const action: Action = payload.action ?? "upsert";
    const firebaseIdToken = payload.firebase_id_token;

    if (!firebaseIdToken) {
      return new Response(JSON.stringify({ ok: false, error: "Missing firebase_id_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { uid } = await verifyFirebaseIdToken(firebaseIdToken);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "exists") {
      const { data, error } = await supabase
        .from("fcm_tokens")
        .select("token")
        .eq("user_id", uid)
        .maybeSingle();

      if (error) {
        console.error("❌ fcm_tokens exists check failed:", error);
        return new Response(JSON.stringify({ ok: false, error: "Failed to check token" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, user_id: uid, has_token: !!data?.token }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === 'upsert'
    const fcmToken = payload.fcm_token;
    if (!fcmToken) {
      return new Response(JSON.stringify({ ok: false, error: "Missing fcm_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("📥 Upserting FCM token for uid:", uid, "device:", payload.device_info || "unknown");

    const { error } = await supabase
      .from("fcm_tokens")
      .upsert(
        {
          user_id: uid,
          token: fcmToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) {
      console.error("❌ fcm_tokens upsert failed:", error);
      return new Response(JSON.stringify({ ok: false, error: "Failed to save token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, user_id: uid }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ register-fcm-token error:", error);
    return new Response(JSON.stringify({ ok: false, error: error?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
