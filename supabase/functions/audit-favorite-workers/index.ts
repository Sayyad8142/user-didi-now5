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
  const rpc = async (label: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc("get_favorite_workers", args);
    out[label] = error ? { error: error.message, code: (error as any).code } : data;
  };

  // A user with a completed maid booking (from earlier probe)
  const user = "e1aeaa32-9a86-4f01-b45e-d7f20ddae167";
  await rpc("completed_user_maid", { p_service: "maid", p_community: "prestige-high-fields", p_user_id: user });
  await rpc("completed_user_bathroom", { p_service: "bathroom_cleaning", p_community: "prestige-high-fields", p_user_id: user });
  await rpc("completed_user_wrong_community", { p_service: "maid", p_community: "qa-villa-test", p_user_id: user });
  await rpc("unknown_user", { p_service: "maid", p_community: "prestige-high-fields", p_user_id: "00000000-0000-0000-0000-000000000000" });

  // Find a user whose only worker-bearing bookings are cancelled
  {
    const { data } = await db
      .from("bookings")
      .select("user_id,worker_id,service_type,community,status")
      .eq("status", "cancelled")
      .not("worker_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    out.cancelled_sample = data;
    for (const b of data || []) {
      const { count } = await db
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", b.user_id)
        .eq("status", "completed");
      if (!count) {
        await rpc("cancelled_only_user", {
          p_service: b.service_type,
          p_community: b.community,
          p_user_id: b.user_id,
        });
        out.cancelled_only_user_id = b.user_id;
        break;
      }
    }
  }

  // How many distinct users have >=1 completed booking with a worker
  {
    const { count } = await db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .not("worker_id", "is", null);
    out.total_completed_with_worker = count;
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
