import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function cleanSecret(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim().replace(/^['"]|['"]$/g, "");
  const eq = v.indexOf("=");
  if (eq > -1 && v.slice(0, eq).includes("KEY")) {
    v = v.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return v;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  try {
    const url = cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) || "https://paywwbuqycovjopryele.supabase.co";
    const key = cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) || cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY"));
    
    if (!key) throw new Error("Missing EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    
    const supabase = createClient(url, key);
    const body = await req.json().catch(() => ({}));
    const audit_phone = body.audit_phone || "+917898496396";
    const community = body.community || "prestige-high-fields";
    const service = body.service || "maid";

    const report: any = { logs: [], params: { audit_phone, community, service } };

    // 1. Trace the worker by phone across all profiles (both DBs if possible, but here we check the worker table)
    const { data: worker, error: wErr } = await supabase
      .from("workers")
      .select("*")
      .eq("phone", audit_phone)
      .maybeSingle();
    
    report.worker = worker;
    report.worker_error = wErr;

    // 2. Sample first 50 workers to check visibility
    const { data: allWorkers } = await supabase.from("workers").select("id, full_name, phone, is_active, is_available, is_busy, communities, service_types").limit(50);
    report.worker_pool_sample = allWorkers;

    if (worker) {
      // 3. Detailed Availability Audit
      const { data: avail } = await supabase
        .from("worker_availability")
        .select("*")
        .eq("worker_id", worker.id);
      report.availability = avail;

      // 4. Current Time & Slot Audit (IST)
      const jsDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
      const v_dow = (jsDate.getDay() + 6) % 7;
      const v_slot = `${String(jsDate.getHours()).padStart(2,'0')}:${jsDate.getMinutes() < 30 ? '00' : '30'}:00`;
      report.calculated = { dow: v_dow, slot: v_slot, ist_iso: jsDate.toISOString() };

      // 5. Logical Gate Audit
      report.eligibility_gates = {
        is_active: worker.is_active,
        is_available: worker.is_available,
        is_not_busy: worker.is_busy === false || worker.is_busy === null,
        community_match: worker.communities?.includes(community),
        service_match: worker.service_types?.includes(service),
        roster_match: avail?.some((a: any) => a.day_of_week === v_dow && a.slots?.includes(v_slot))
      };
    }

    // 6. Direct RPC Execution Audit
    const { data: online_counts, error: rpcErr1 } = await supabase.rpc("get_online_workers_count", { p_community: community });
    report.rpc_online_counts = online_counts;
    report.rpc_online_counts_error = rpcErr1;

    const { data: eligible_workers, error: rpcErr2 } = await supabase.rpc("get_eligible_workers", { 
      p_service: service, 
      p_community: community 
    });
    report.rpc_eligible_workers = eligible_workers;
    report.rpc_eligible_workers_error = rpcErr2;

    // 7. Check if Sid is in the eligible list
    report.is_sid_in_eligible_list = eligible_workers?.some((w: any) => w.worker_id === worker?.id);

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
