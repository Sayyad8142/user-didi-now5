// Deletes the caller's account: bookings, profile, and best-effort Supabase auth row.
// Auth: Firebase ID token via x-firebase-token header (Twilio Verify -> custom token flow).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceKey) {
      return new Response("Server configuration error", { status: 500, headers: corsHeaders });
    }

    // 1) Verify Firebase token
    const token = extractToken(req);
    if (!token) {
      return new Response("Missing token", { status: 401, headers: corsHeaders });
    }

    let firebaseUser;
    try {
      firebaseUser = await verifyFirebaseToken(token);
    } catch (e) {
      console.error("[delete-auth-user] token verify failed", e);
      return new Response("Invalid token", { status: 401, headers: corsHeaders });
    }

    const firebaseUid = firebaseUser.uid;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 2) Resolve internal profile
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (profErr) {
      console.error("[delete-auth-user] profile lookup failed", profErr);
      return new Response(`Profile lookup failed: ${profErr.message}`, { status: 500, headers: corsHeaders });
    }

    if (profile?.id) {
      const profileId = profile.id;
      console.log(`[delete-auth-user] deleting data for profile ${profileId} (firebase ${firebaseUid})`);

      // 3) Delete dependent rows then profile (best-effort, log but continue)
      const { error: bookingsErr } = await supabase
        .from("bookings")
        .delete()
        .eq("user_id", profileId);
      if (bookingsErr) console.warn("[delete-auth-user] bookings delete warn", bookingsErr);

      const { error: walletErr } = await supabase
        .from("user_wallets")
        .delete()
        .eq("user_id", profileId);
      if (walletErr) console.warn("[delete-auth-user] wallet delete warn", walletErr);

      const { error: fcmErr } = await supabase
        .from("fcm_tokens")
        .delete()
        .eq("user_id", profileId);
      if (fcmErr) console.warn("[delete-auth-user] fcm delete warn", fcmErr);

      const { error: profileDelErr } = await supabase
        .from("profiles")
        .delete()
        .eq("id", profileId);
      if (profileDelErr) {
        console.error("[delete-auth-user] profile delete failed", profileDelErr);
        return new Response(`Profile delete failed: ${profileDelErr.message}`, { status: 500, headers: corsHeaders });
      }
    } else {
      console.log(`[delete-auth-user] no profile found for firebase ${firebaseUid}; nothing to delete`);
    }

    // 4) Best-effort: delete a Supabase auth row if one happens to share the firebase uid.
    //    Twilio-only users won't have a Supabase auth row — that's fine.
    try {
      const { error: authDelErr } = await supabase.auth.admin.deleteUser(firebaseUid);
      if (authDelErr && !`${authDelErr.message}`.toLowerCase().includes("not found")) {
        console.warn("[delete-auth-user] supabase auth delete warn", authDelErr);
      }
    } catch (e) {
      console.warn("[delete-auth-user] supabase auth delete exception", e);
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[delete-auth-user] server error", e);
    return new Response(`Server error: ${e}`, { status: 500, headers: corsHeaders });
  }
});
