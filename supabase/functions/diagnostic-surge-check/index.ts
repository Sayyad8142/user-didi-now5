import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";
import { corsHeaders } from "../_shared/firebaseAuth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY);

    // 1. Find all unique community_ids in slot_surge_pricing
    const { data: uniqueCommunities, error: surgeError } = await supabase
      .from('slot_surge_pricing')
      .select('community_id, service_key')
      .limit(100);

    // 2. Map them to names
    const ids = Array.from(new Set(uniqueCommunities?.map(c => c.community_id).filter(Boolean) || []));
    const { data: names } = await supabase
      .from('communities')
      .select('id, name')
      .in('id', ids);

    return new Response(JSON.stringify({
      found_community_ids: ids,
      community_names: names,
      raw_sample: uniqueCommunities?.slice(0, 10),
      db_host: new URL(EXTERNAL_SUPABASE_URL).host,
      error: surgeError
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
