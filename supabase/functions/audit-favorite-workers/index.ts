// TEMPORARY read-only probe for the favorite-worker audit. Delete after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY } from "../_shared/externalSupabaseEnv.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const out: Record<string, unknown> = {};
  const userId = "e1aeaa32-9a86-4f01-b45e-d7f20ddae167";

  // Simulate exactly what list-favorite-workers does after token verification.
  const { data: profile } = await db
    .from("profiles")
    .select("id,firebase_uid,phone,community")
    .eq("id", userId)
    .maybeSingle();
  out.profile = profile
    ? { id: profile.id, has_firebase_uid: !!profile.firebase_uid, community: profile.community }
    : null;

  if (profile?.firebase_uid) {
    const { data: byUid } = await db
      .from("profiles")
      .select("id")
      .eq("firebase_uid", profile.firebase_uid)
      .maybeSingle();
    out.reverse_uid_lookup_matches = byUid?.id === userId;
  }

  const { data, error } = await db.rpc("get_favorite_workers", {
    p_service: "maid",
    p_community: profile?.community ?? "prestige-high-fields",
    p_user_id: userId,
  });
  out.proxy_simulated_result = error ? { error: error.message } : data;

  // Fallback path (used only if the RPC ever disappears)
  const { data: bookings } = await db
    .from("bookings")
    .select("worker_id,created_at")
    .eq("user_id", userId)
    .eq("service_type", "maid")
    .eq("community", profile?.community ?? "prestige-high-fields")
    .eq("status", "completed")
    .not("worker_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  out.fallback_distinct_workers = [...new Set((bookings || []).map((b: any) => b.worker_id))];

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
