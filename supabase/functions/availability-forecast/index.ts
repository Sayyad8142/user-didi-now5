// Edge function: availability-forecast
// Returns 13 hourly availability buckets (7AM..7PM) for a given
// (community, service_type) by reading the precomputed
// `community_hourly_availability` materialized view on the EXTERNAL
// Supabase (api.didisnow.com) via the `get_availability_forecast` RPC.
//
// Public (no JWT). Response is cached for 15 minutes via Cache-Control.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-firebase-token",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=900, s-maxage=900",
      ...extra,
    },
  });
}

function cleanSecret(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim().replace(/^['"]|['"]$/g, "");
  const eq = v.indexOf("=");
  if (eq > -1 && v.slice(0, eq).includes("KEY")) {
    v = v.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return v;
}

const VALID_SERVICES = new Set(["maid", "bathroom_cleaning"]);

// Fallback if DB RPC is not yet deployed: return optimistic flat forecast
function fallbackForecast() {
  return Array.from({ length: 13 }, (_, i) => {
    const hour = 7 + i;
    // Mild U-shape: midday slight dip, late afternoon dip
    let pct = 88;
    if (hour >= 12 && hour <= 13) pct = 70;
    if (hour >= 17) pct = 55;
    if (hour >= 18) pct = 40;
    const bucket =
      pct >= 80 ? "very_high" :
      pct >= 60 ? "high" :
      pct >= 40 ? "medium" :
      pct >= 20 ? "low" : "very_low";
    return {
      hour_of_day: hour,
      total_bookings: 0,
      fulfilled_bookings: 0,
      failed_bookings: 0,
      availability_pct: pct,
      bucket,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let community = url.searchParams.get("community") || "";
    let service = url.searchParams.get("service") || "";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      community = community || body.community || "";
      service = service || body.service || "";
    }

    if (!community || !service) {
      return json({ error: "community and service required" }, 400);
    }
    if (!VALID_SERVICES.has(service)) {
      return json({ error: "unsupported service" }, 400);
    }

    const supabaseUrl =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      cleanSecret(Deno.env.get("PROFILES_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const serviceRoleKey =
      cleanSecret(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      cleanSecret(Deno.env.get("PROFILES_SUPABASE_SERVICE_ROLE_KEY"));

    if (!supabaseUrl || !serviceRoleKey) {
      console.warn("[availability-forecast] missing external creds, fallback");
      return json({ source: "fallback", forecast: fallbackForecast() });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.rpc("get_availability_forecast", {
      p_community: community,
      p_service: service,
    });

    if (error) {
      console.error("[availability-forecast] rpc error", error.message);
      return json({ source: "fallback", forecast: fallbackForecast(), error: error.message });
    }

    return json({ source: "db", community, service, forecast: data ?? [] });
  } catch (e) {
    console.error("[availability-forecast] uncaught", e);
    return json({ source: "fallback", forecast: fallbackForecast() });
  }
});
