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
    const { audit_phone, community, service } = await req.json();

    const report: any = { logs: [] };

    // 1. Worker Profile
    const { data: worker, error: wErr } = await supabase
      .from("workers")
      .select("*")
      .eq("phone", audit_phone || "+917898496396")
      .maybeSingle();
    
    report.worker = worker;
    report.worker_error = wErr;

    if (worker) {
      // 2. Availability
      const { data: avail } = await supabase
        .from("worker_availability")
        .select("*")
        .eq("worker_id", worker.id);
      report.availability = avail;

      // 3. IST Check
      const { data: ist } = await supabase.rpc("ist_now_string");
      report.ist_db = ist;
      
      const jsDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
      const v_dow = (jsDate.getDay() + 6) % 7;
      const v_slot = `${String(jsDate.getHours()).padStart(2,'0')}:${jsDate.getMinutes() < 30 ? '00' : '30'}:00`;
      report.calculated = { dow: v_dow, slot: v_slot };

      // 4. Manual Logic Simulation
      report.eligibility_gates = {
        active: worker.is_active,
        available: worker.is_available,
        not_busy: !worker.is_busy,
        community_match: worker.communities?.includes(community || "prestige-high-fields"),
        service_match: worker.service_types?.includes(service || "maid"),
        slot_match: avail?.some((a: any) => a.day_of_week === v_dow && a.slots?.includes(v_slot))
      };
    }

    // 5. RPC Direct Tests
    const { data: online_counts } = await supabase.rpc("get_online_workers_count", { p_community: community || "prestige-high-fields" });
    report.rpc_online_counts = online_counts;

    const { data: eligible_workers } = await supabase.rpc("get_eligible_workers", { 
      p_service: service || "maid", 
      p_community: community || "prestige-high-fields" 
    });
    report.rpc_eligible_workers = eligible_workers;

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
