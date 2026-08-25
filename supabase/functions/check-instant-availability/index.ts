/**
 * check-instant-availability — CANONICAL instant-availability resolver.
 *
 * Single source of truth used by:
 *   - the new app build (useInstantAvailabilityV2)
 *   - check-booking-capacity (pre-payment gate, all app versions)
 *
 * Rules (all evaluated server-side, IST / Asia/Kolkata):
 *   1. Operating hours 07:00–19:00 IST.
 *   2. Per-service instant capacity cap (capacityRules.ts).
 *   3. At least one eligible/fresh worker for community + service.
 *
 * Never trusts device time, device timezone or client-cached counts.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  countActiveInstantBookings,
  getExternalSupabase,
  limitForService,
} from "../_shared/capacityRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-version, x-app-platform",
};

export function istNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 5.5 * 60 * 60 * 1000);
}

export interface AvailabilityAnswer {
  available: boolean;
  reason:
    | "AVAILABLE"
    | "CLOSED"
    | "BUSY"
    | "NO_SUPPLY"
    | "MISSING_INPUTS"
    | "ERROR";
  message: string;
  eligible_worker_count: number;
  pending_count: number;
  limit: number;
  ist_time: string;
}

/** Reads a worker count row regardless of which column name the RPC returns. */
function readCount(row: Record<string, unknown> | undefined): number {
  if (!row) return 0;
  const raw =
    (row.online_count as number) ??
    (row.fresh_count as number) ??
    (row.total_count as number) ??
    (row.count as number) ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Canonical resolver. Exported so other edge functions reuse the exact
 * same rules instead of duplicating them.
 */
export async function resolveInstantAvailability(
  community: string,
  service: string,
  diag: Record<string, unknown> = {},
): Promise<AvailabilityAnswer> {
  const now = istNow();
  const ist = now.toISOString();
  const hours = now.getHours();
  const limit = limitForService(service);

  if (hours < 7 || hours >= 19) {
    console.log(
      `[availability] blocked reason=CLOSED ist_hour=${hours} community=${community} service=${service} diag=${JSON.stringify(diag)}`,
    );
    return {
      available: false,
      reason: "CLOSED",
      message: "Service is closed. Operating hours are 7 AM - 7 PM IST.",
      eligible_worker_count: 0,
      pending_count: 0,
      limit,
      ist_time: ist,
    };
  }

  // Per-service capacity (authoritative, EXTERNAL DB).
  const capacity = await countActiveInstantBookings(community, service);

  // Eligible worker supply.
  const supabase = getExternalSupabase();
  const { data: rows, error } = await supabase.rpc("get_online_workers_count", {
    p_community: community,
  });
  if (error) throw error;

  const list = (rows || []) as Record<string, unknown>[];
  const eligible = readCount(list.find((r) => r.service === service));

  console.log(
    `[availability] resolved community=${community} service=${service} ist=${ist} ist_hour=${hours} ` +
      `eligible=${eligible} active_instant=${capacity.active_count} limit=${capacity.limit} ` +
      `raw_counts=${JSON.stringify(list)} diag=${JSON.stringify(diag)}`,
  );

  if (capacity.is_full) {
    return {
      available: false,
      reason: "BUSY",
      message: "All experts are currently busy. Please try again after 20 minutes.",
      eligible_worker_count: eligible,
      pending_count: capacity.active_count,
      limit: capacity.limit,
      ist_time: ist,
    };
  }

  if (eligible <= 0) {
    return {
      available: false,
      reason: "NO_SUPPLY",
      message: "No experts are currently available in your area.",
      eligible_worker_count: 0,
      pending_count: capacity.active_count,
      limit: capacity.limit,
      ist_time: ist,
    };
  }

  return {
    available: true,
    reason: "AVAILABLE",
    message: "Experts are available!",
    eligible_worker_count: eligible,
    pending_count: capacity.active_count,
    limit: capacity.limit,
    ist_time: ist,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const community = body.community ?? body.community_name;
  const service = body.service ?? body.service_type;
  const diag = {
    app_version: req.headers.get("x-app-version") ?? body.app_version ?? "unknown",
    platform: req.headers.get("x-app-platform") ?? body.platform ?? "unknown",
    client: req.headers.get("x-client-info") ?? "unknown",
    requested_at: new Date().toISOString(),
  };

  const json = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!community || !service) {
    console.warn(
      `[availability] blocked reason=MISSING_INPUTS community=${community} service=${service} diag=${JSON.stringify(diag)}`,
    );
    return json({
      available: false,
      reason: "MISSING_INPUTS",
      message: "Community and service are required",
    });
  }

  try {
    return json(await resolveInstantAvailability(community, service, diag) as unknown as Record<string, unknown>);
  } catch (err) {
    console.error("[availability] error", (err as Error).message, JSON.stringify(diag));
    return json(
      {
        available: false,
        reason: "ERROR",
        message: "Failed to verify availability. Please try again.",
      },
      500,
    );
  }
});
