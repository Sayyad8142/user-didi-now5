// ============================================================================
// list-slot-availability
// Service-role proxy for get_scheduled_slot_availability on the external DB.
// Purpose: the anon/authenticated roles currently lack EXECUTE on that RPC
// (Postgres 42501), which made the app fall back to "unknown availability".
// This proxy restores an authoritative allowlist AND surfaces the underlying
// permission failure to admin monitoring instead of silently degrading.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-firebase-token, x-app-version, x-app-platform",
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

// Alert admins at most once per 30 min per failure signature (per isolate).
const alerted = new Map<string, number>();
async function alertAdmins(signature: string, message: string) {
  const now = Date.now();
  const last = alerted.get(signature) || 0;
  if (now - last < 30 * 60 * 1000) return;
  alerted.set(signature, now);
  try {
    const base = clean(Deno.env.get("SUPABASE_URL"));
    const key = clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!base || !key) return;
    await fetch(`${base}/functions/v1/send-telegram-alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    console.error("[list-slot-availability] admin alert failed", (e as Error)?.message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const community = body?.community as string | undefined;
    const serviceType = body?.service_type as string | undefined;
    const date = body?.date as string | undefined;
    const clientError = body?.client_rpc_error as string | undefined;

    if (!community || !serviceType || !date) {
      return json({ error: "community, service_type and date are required", slots: null }, 400);
    }

    // Report the client's direct-RPC failure so the real cause gets fixed
    // instead of the fallback becoming permanent.
    if (clientError) {
      console.error(
        `[list-slot-availability] ⚠️ CLIENT_RPC_DENIED get_scheduled_slot_availability community=${community} service=${serviceType} date=${date} error="${clientError}"`,
      );
      if (/permission denied|42501/i.test(clientError)) {
        await alertAdmins(
          "slot_availability_rpc_denied",
          `⚠️ get_scheduled_slot_availability is not executable by app clients (permission denied / 42501).\n` +
            `Scheduled-slot availability is running on the service-role proxy fallback.\n` +
            `Fix: run docs/fix-scheduled-slot-availability-grants.sql on api.didisnow.com.\n` +
            `Sample: community=${community} service=${serviceType} date=${date}`,
        );
      }
    }

    const url =
      clean(Deno.env.get("EXTERNAL_SUPABASE_URL")) ||
      "https://paywwbuqycovjopryele.supabase.co";
    const key =
      clean(Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")) ||
      clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    if (!key) {
      return json({ error: "Backend not configured", slots: null }, 500);
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc("get_scheduled_slot_availability", {
      p_community: community,
      p_service_type: serviceType,
      p_date: date,
    });

    if (error) {
      console.error("[list-slot-availability] rpc failed", error.code, error.message);
      await alertAdmins(
        `slot_availability_rpc_${error.code || "err"}`,
        `❌ get_scheduled_slot_availability failed even with the service role: ${error.code || ""} ${error.message}`,
      );
      return json({ error: error.message, code: error.code, slots: null }, 500);
    }

    const slots = ((data as any[]) || []).map((r) => ({
      slot_time: String(r.slot_time).slice(0, 5),
      worker_count: Number(r.worker_count) || 0,
    }));

    return json({ slots, source: "service_role_proxy" });
  } catch (e: any) {
    console.error("[list-slot-availability] unexpected", e?.message);
    return json({ error: e?.message || "Unexpected error", slots: null }, 500);
  }
});
