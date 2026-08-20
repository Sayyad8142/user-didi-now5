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
    const { data: detail } = await supabase
      .from('slot_surge_pricing')
      .select('*')
      .eq('community_id', '7b7c6481-a983-44bd-b43a-5fee9b464e31')
      .limit(100);

    return new Response(JSON.stringify({
      community: "Prestige High Fields",
      surge_count: detail?.length,
      data: detail
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
