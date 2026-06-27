// Persists favorite-worker analytics events to public.favorite_worker_events on Lovable Cloud.
// Append-only. Service-role insert. Best-effort, never throws back to caller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_EVENTS = new Set([
  "favorite_worker_selected",
  "favorite_worker_assigned",
  "favorite_worker_unavailable",
  "favorite_worker_fallback_used",
  "favorite_worker_refunded",
]);

interface Payload {
  event_name?: string;
  user_id?: string | null;
  booking_id?: string | null;
  worker_id?: string | null;
  requested_preferred_worker_id?: string | null;
  service_type?: string | null;
  community?: string | null;
  fallback_latency_ms?: number | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

function asUuidOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Payload;
    const event_name = String(body.event_name || "").trim();

    if (!ALLOWED_EVENTS.has(event_name)) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_event_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const row = {
      event_name,
      user_id: asUuidOrNull(body.user_id),
      booking_id: asUuidOrNull(body.booking_id),
      worker_id: asUuidOrNull(body.worker_id),
      requested_preferred_worker_id: asUuidOrNull(body.requested_preferred_worker_id),
      service_type: body.service_type ? String(body.service_type).slice(0, 64) : null,
      community: body.community ? String(body.community).slice(0, 128) : null,
      fallback_latency_ms:
        typeof body.fallback_latency_ms === "number" && Number.isFinite(body.fallback_latency_ms)
          ? Math.max(0, Math.round(body.fallback_latency_ms))
          : null,
      request_id: body.request_id ? String(body.request_id).slice(0, 128) : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    };

    const { error } = await supabase.from("favorite_worker_events").insert(row);
    if (error) {
      console.error("[track-favorite-worker-event] insert error", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[track-favorite-worker-event] unexpected", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
