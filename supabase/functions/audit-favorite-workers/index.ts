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
  const out: Record<string, unknown> = { url: EXTERNAL_SUPABASE_URL };

  // 1. recent completed bookings with a worker
  {
    const { data, error } = await db
      .from("bookings")
      .select("id,user_id,worker_id,worker_name,service_type,community,status,booking_type,preferred_worker_id,created_at")
      .eq("status", "completed")
      .not("worker_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    out.completed_bookings = error ? { error: error.message } : data;
  }

  // 2. call the RPC with service role for the most recent completed booking's user
  const sample = (out.completed_bookings as any[])?.[0];
  if (sample) {
    const { data, error } = await db.rpc("get_favorite_workers", {
      p_service: sample.service_type,
      p_community: sample.community,
      p_user_id: sample.user_id,
    });
    out.rpc_service_role = error ? { error: error.message, code: (error as any).code } : data;

    const { data: w, error: we } = await db
      .from("workers")
      .select("*")
      .eq("id", sample.worker_id)
      .maybeSingle();
    out.worker_row = we ? { error: we.message } : w;
  }

  // 3. worker table shape / a few workers
  {
    const { data, error } = await db.from("workers").select("*").limit(2);
    out.workers_sample = error ? { error: error.message } : data;
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
