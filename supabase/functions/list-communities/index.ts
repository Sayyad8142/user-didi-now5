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
    const url =
      clean(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const key =
      clean(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    if (!key) {
      return json({ error: "Backend not configured", communities: [] }, 500);
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let includeInactive = false;
    try {
      const body = req.method === "POST" ? await req.json() : {};
      includeInactive = body?.include_inactive === true;
    } catch (_) {
      // no body
    }

    const run = async (select: string) => {
      let q = supabase.from("communities").select(select);
      if (!includeInactive) q = q.eq("is_active", true);
      return await q.order("name");
    };

    // Phase 2A: community_type ('apartment' | 'villa'). Fall back if column absent.
    let { data, error } = await run(
      "id, name, value, is_active, flat_format, community_type",
    );
    if (error) {
      console.warn("[list-communities] community_type select failed", error.message);
      ({ data, error } = await run("id, name, value, is_active, flat_format"));
    }

    if (error) {
      console.error("[list-communities] query failed", error.message);
      return json({ error: error.message, communities: [] }, 500);
    }

    const communities = (data || []).map((c: any) => ({
      ...c,
      community_type:
        String(c?.community_type ?? "").toLowerCase() === "villa"
          ? "villa"
          : "apartment",
    }));

    return json({ communities });

  } catch (e: any) {
    console.error("[list-communities] unexpected", e?.message);
    return json({ error: e?.message || "Unexpected error", communities: [] }, 500);
  }
});
