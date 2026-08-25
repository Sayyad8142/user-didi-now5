/**
 * audit-external-db — read-only diagnostic probe of the EXTERNAL database.
 *
 * Reports:
 *  - shape of get_online_workers_count / _core (old-app online_count contract)
 *  - check_instant_supply + per-service variants
 *  - whether the automatic-cancellation functions are neutralised
 * Never writes anything.
 */
import { getExternalSupabase } from "../_shared/capacityRules.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  const community: string = body.community ?? "prestige-high-fields";
  const db = getExternalSupabase();
  const report: Record<string, unknown> = { community };

  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    return error ? { error: error.message } : { data };
  };

  report.get_online_workers_count = await rpc("get_online_workers_count", { p_community: community });
  report.get_online_workers_count_core = await rpc("get_online_workers_count_core", { p_community: community });
  report.check_instant_supply = await rpc("check_instant_supply", { p_community: community });
  report.instant_limit_for_service_maid = await rpc("instant_limit_for_service", { p_service_type: "maid" });
  report.check_instant_supply_for_service_maid = await rpc("check_instant_supply_for_service", {
    p_community: community,
    p_service_type: "maid",
  });
  report.check_instant_supply_for_service_bathroom = await rpc("check_instant_supply_for_service", {
    p_community: community,
    p_service_type: "bathroom_cleaning",
  });

  // Automatic-cancellation probes: the neutralised versions must return 0 and cancel nothing.
  report.auto_cancel_stale_instant_bookings = await rpc("auto_cancel_stale_instant_bookings", {});
  report.auto_handle_overdue_bookings = await rpc("auto_handle_overdue_bookings", {});

  // Recent automatic-looking cancellations (evidence of remaining paths).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cancelled = await db
    .from("bookings")
    .select("id,status,booking_type,service_type,created_at,cancelled_at,cancelled_by,cancellation_reason")
    .eq("status", "cancelled")
    .gte("cancelled_at", since)
    .order("cancelled_at", { ascending: false })
    .limit(50);
  report.cancelled_last_24h = cancelled.error ? { error: cancelled.error.message } : cancelled.data;

  const waiting = await db
    .from("bookings")
    .select("id,status,booking_type,service_type,created_at,worker_id")
    .in("status", ["pending", "dispatched", "waiting_for_worker"])
    .order("created_at", { ascending: false })
    .limit(25);
  report.currently_waiting = waiting.error ? { error: waiting.error.message } : waiting.data;

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
