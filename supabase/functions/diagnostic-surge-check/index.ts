
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";
import { corsHeaders } from "../_shared/firebaseAuth.ts";

/**
 * Diagnostic function to dump surge pricing configuration for a specific community.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { community_id, service_key = 'maid' } = await req.json();
    if (!community_id) return new Response(JSON.stringify({ error: "community_id required" }), { status: 400, headers: corsHeaders });

    const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);

    // 1. Check if table exists and has data
    const { data: surgeData, error: surgeError } = await supabase
      .from('slot_surge_pricing')
      .select('*')
      .eq('community_id', community_id)
      .eq('service_key', service_key);

    // 2. Check community details
    const { data: community, error: commError } = await supabase
      .from('communities')
      .select('id, name')
      .eq('id', community_id)
      .maybeSingle();

    return new Response(JSON.stringify({
      community,
      surge_count: surgeData?.length ?? 0,
      active_surge_count: surgeData?.filter(s => s.is_active).length ?? 0,
      sample_data: surgeData?.slice(0, 10),
      errors: { surgeError, commError },
      db_host: new URL(EXTERNAL_SUPABASE_URL).host,
      timestamp: new Date().toISOString()
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
