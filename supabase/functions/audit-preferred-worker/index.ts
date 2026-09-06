/**
 * TEMPORARY read-only probe: does bookings.preferred_worker_id ever get set?
 * Delete after the audit.
 */
import { getExternalSupabase } from "../_shared/capacityRules.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = getExternalSupabase();
  const out: Record<string, unknown> = {};

  {
    const { data, error } = await db.from("bookings").select("id,preferred_worker_id").limit(1);
    out.column_exists = error ? { error: error.message } : true;
    out.sample = data;
  }
  {
    const { count, error } = await db.from("bookings").select("id", { count: "exact", head: true });
    out.total_bookings = error ? error.message : count;
  }
  {
    const { count, error } = await db
      .from("bookings").select("id", { count: "exact", head: true })
      .not("preferred_worker_id", "is", null);
    out.with_preferred = error ? error.message : count;
  }
  {
    const { data, error } = await db
      .from("bookings")
      .select("id,created_at,status,booking_type,service_type,worker_id,preferred_worker_id,payment_method,payment_status")
      .order("created_at", { ascending: false })
      .limit(15);
    out.recent = error ? error.message : data;
  }
  {
    const { data, error } = await db.rpc("get_favorite_workers", {
      p_service: "maid",
      p_community: "prestige-high-fields",
      p_user_id: "e1aeaa32-9a86-4f01-b45e-d7f20ddae167",
    });
    out.favorites_for_test_user = error ? error.message : data;
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
