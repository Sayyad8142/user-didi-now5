import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-firebase-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clean = (raw?: string | null) => {
  if (!raw) return "";
  let v = raw.trim().replace(/^['"]|['"]$/g, "");
  const eq = v.indexOf("=");
  if (eq > -1 && v.slice(0, eq).includes("KEY")) {
    v = v.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return v;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const communityId = body?.community_id as string | undefined;
    const serviceKey = (body?.service_key as string | undefined) || "maid";

    if (!communityId) {
      return json({ error: "community_id required", slots: [] }, 400);
    }

    const url =
      clean(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const key =
      clean(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    if (!key) {
      return json({ error: "Backend not configured", slots: [] }, 500);
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("slot_surge_pricing")
      .select("slot_time, slot_period, surge_amount")
      .eq("community_id", communityId)
      .eq("service_key", serviceKey)
      .eq("is_active", true);

    if (error) {
      console.error("[list-slot-surge] query failed", error.message);
      return json({ error: error.message, slots: [] }, 500);
    }

    return json({ slots: data || [] });
  } catch (e: any) {
    console.error("[list-slot-surge] unexpected", e?.message);
    return json({ error: e?.message || "Unexpected error", slots: [] }, 500);
  }
});
