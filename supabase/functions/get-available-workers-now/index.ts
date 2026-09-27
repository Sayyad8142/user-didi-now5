/**
 * get-available-workers-now — customer "Available right now" counts.
 * Uses the canonical dispatch pool (_shared/eligibleWorkers.ts).
 * Body: { community, debug?: boolean }
 * debug=true adds a comparison against the legacy heartbeat-gated
 * get_online_workers_count and per-worker push/blocked/paused fields.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { getDispatchEligibleCount } from "../_shared/eligibleWorkers.ts";

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

    const counts: Record<string, number> = {};
    for (const s of SERVICES) counts[s] = await getDispatchEligibleCount(sb, community, s);
    const result = { community, source: "get_dispatch_eligible_worker_count", generated_at: new Date().toISOString(), counts };
    console.log(`[avail-now] ${community} ${JSON.stringify(counts)}`);
    return json(result);
  } catch (e) {
    console.error("[avail-now] error", (e as Error).message);
    return json({ error: "Failed to load availability" }, 500);
  }
});
