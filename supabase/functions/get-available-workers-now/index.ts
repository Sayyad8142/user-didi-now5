/**
 * get-available-workers-now — customer "Available right now" counts.
 * Uses the canonical dispatch pool (_shared/eligibleWorkers.ts).
 * Body: { community, debug?: boolean }
 * debug=true adds a comparison against the legacy heartbeat-gated
 * get_online_workers_count and per-worker push/blocked/paused fields.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { getEligiblePool } from "../_shared/eligibleWorkers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-firebase-token, x-app-version, x-app-platform",
};
const clean = (v?: string | null) => (v || "").trim().replace(/^['"]|['"]$/g, "");
const SERVICES = ["maid", "bathroom_cleaning"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (p: unknown, status = 200) =>
    new Response(JSON.stringify(p), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const community = typeof body.community === "string" ? body.community.trim().slice(0, 100) : "";
    if (!community) return json({ error: "community is required" }, 400);
    const sb = createClient(
      clean(Deno.env.get("EXTERNAL_SUPABASE_URL")) || "https://paywwbuqycovjopryele.supabase.co",
      clean(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")),
    );

    const pools = await Promise.all(SERVICES.map((s) => getEligiblePool(sb, community, s)));
    const counts: Record<string, number> = {};
    pools.forEach((p) => (counts[p.service] = p.count));
    const result: Record<string, unknown> = {
      community,
      source: "get_eligible_workers",
      generated_at: new Date().toISOString(),
      counts,
      services: pools.map((p) => ({ service: p.service, count: p.count, worker_ids: p.worker_ids })),
    };

    if (body.debug === true) {
      const { data: legacy } = await sb.rpc("get_online_workers_count", { p_community: community });
      const allIds = [...new Set(pools.flatMap((p) => p.worker_ids))];
      const { data: w } = allIds.length
        ? await sb.from("workers").select(
          "id,full_name,is_active,is_available,is_busy,is_blocked,blocked_until,auto_paused_at,auto_paused_restored_at,dispatch_cooldown_until,fcm_token,fcm_token_status,push_health_status,push_block_reason,last_seen_at,last_heartbeat_at,deleted_at",
        ).in("id", allIds)
        : { data: [] };
      result.comparison = pools.map((p) => {
        const row = (legacy || []).find((r: any) => r.service === p.service) || {};
        const legacyCount = Number(row.online_count ?? 0);
        return {
          service: p.service,
          legacy_heartbeat_count: legacyCount,
          dispatch_eligible_count: p.count,
          difference: p.count - legacyCount,
          mismatch: p.count !== legacyCount,
          stale_but_eligible: p.workers.filter((x: any) => x.is_fresh === false).map((x: any) => x.worker_id),
        };
      });
      result.worker_details = (w || []).map((x: any) => ({ ...x, fcm_token: x.fcm_token ? "present" : null }));
    }
    console.log(`[avail-now] ${community} ${JSON.stringify(counts)}`);
    return json(result);
  } catch (e) {
    console.error("[avail-now] error", (e as Error).message);
    return json({ error: "Failed to load availability" }, 500);
  }
});
