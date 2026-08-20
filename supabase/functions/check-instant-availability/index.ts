import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
function getISTDate(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + istOffset);
}

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
    const community = body.community;
    const service = body.service || body.service_type;

    console.log(`[check-instant-availability] Checking: community=${community}, service=${service}`);

    if (!community || !service) {
      return new Response(JSON.stringify({ 
        available: false, 
        reason: "MISSING_INPUTS", 
        message: "Community and service are required" 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. Check Operating Hours (IST 7AM - 7PM)
    const istNow = getISTDate();
    const hours = istNow.getHours();
    const is_open = hours >= 7 && hours < 19;
    
    if (!is_open) {
      return new Response(JSON.stringify({
        available: false,
        reason: "CLOSED",
        message: "Service is closed. Operating hours are 7 AM - 7 PM IST.",
        ist_time: istNow.toISOString(),
        hours
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Check Capacity (Active Instant Bookings Cap)
    const { data: pending_count, error: capErr } = await supabase.rpc("check_instant_supply", { p_community: community });
    if (capErr) throw capErr;
    
    const CAPACITY_LIMIT = service === 'bathroom_cleaning' ? 1 : 3;
    const is_capacity_full = (pending_count ?? 0) >= CAPACITY_LIMIT;

    if (is_capacity_full) {
      return new Response(JSON.stringify({
        available: false,
        reason: "BUSY",
        message: "All experts are currently busy. Please try again after 20 minutes.",
        pending_count,
        limit: CAPACITY_LIMIT
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Check Worker Supply (Eligible Workers)
    const { data: online_workers, error: supplyErr } = await supabase.rpc("get_online_workers_count", { p_community: community });
    if (supplyErr) throw supplyErr;

    console.log(`[check-instant-availability] online_workers result:`, JSON.stringify(online_workers));
    const count = (online_workers || []).find((r: any) => r.service === service)?.total_count ?? 0;
    const has_supply = Number(count) > 0;

    if (!has_supply) {
      return new Response(JSON.stringify({
        available: false,
        reason: "NO_SUPPLY",
        message: "No experts are currently available in your area.",
        online_count: 0
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Success
    return new Response(JSON.stringify({
      available: true,
      reason: "AVAILABLE",
      message: "Experts are available!",
      eligible_worker_count: Number(count),
      ist_time: istNow.toISOString()
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[check-instant-availability] Error:", err.message);
    return new Response(JSON.stringify({ 
      available: false, 
      reason: "ERROR", 
      message: "Failed to verify availability. Please try again." 
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
