/**
 * check-booking-capacity — Pre-payment capacity gate.
 *
 * Called by the frontend BEFORE creating a Razorpay order (Layer 1)
 * so users are never charged when the instant-booking supply cap is full.
 *
 * The authoritative guard remains the DB trigger on `bookings` insert
 * (raises SUPPLY_FULL when >= 3 pending/dispatched instant bookings per
 * community). This function mirrors that exact rule for a read-only check.
 *
 * Input:  { community_name, service_type, booking_type }
 * Output: { can_accept_booking, reason, pending_count, online_workers, available_workers }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_PENDING_INSTANT = 3; // must match DB trigger + useSupplyCheck.ts

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-firebase-token",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { community_name, service_type, booking_type } = await req
      .json()
      .catch(() => ({}));

    console.log(
      `[check-booking-capacity] CAPACITY_CHECK_REQUESTED community=${community_name} service=${service_type} type=${booking_type}`,
    );

    // Scheduled bookings are governed by slot availability, not the instant cap.
    if (booking_type && booking_type !== "instant") {
      console.log("[check-booking-capacity] CAPACITY_CHECK_PASSED (non-instant)");
      return json({
        can_accept_booking: true,
        reason: null,
        pending_count: 0,
        online_workers: 0,
        available_workers: 0,
      });
    }

    if (!community_name || typeof community_name !== "string") {
      // Fail-open: never block payment on a malformed check.
      console.warn("[check-booking-capacity] missing community_name — fail-open");
      return json({
        can_accept_booking: true,
        reason: "missing_community",
        pending_count: 0,
        online_workers: 0,
        available_workers: 0,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Pending instant bookings for this community (same rule as DB trigger)
    let pendingCount = 0;
    let pendingKnown = false;
    try {
      const { data, error } = await supabase.rpc("check_instant_supply", {
        p_community: community_name,
      });
      if (!error && data !== null && data !== undefined) {
        pendingCount = Number(data) || 0;
        pendingKnown = true;
      } else if (error) {
        console.warn("[check-booking-capacity] check_instant_supply error:", error.message);
      }
    } catch (e) {
      console.warn("[check-booking-capacity] check_instant_supply threw:", (e as Error).message);
    }

    // 2. Online worker counts (informational; fail-open on errors)
    let onlineWorkers = 0;
    try {
      const { data, error } = await supabase.rpc("get_online_workers_count", {
        p_community: community_name,
      });
      if (!error && Array.isArray(data)) {
        for (const row of data as Array<{ service: string; online_count: number }>) {
          if (!service_type || row.service === service_type) {
            onlineWorkers += Number(row.online_count) || 0;
          }
        }
      }
    } catch (e) {
      console.warn("[check-booking-capacity] get_online_workers_count threw:", (e as Error).message);
    }

    const supplyFull = pendingKnown && pendingCount >= MAX_PENDING_INSTANT;
    const availableWorkers = Math.max(0, onlineWorkers - pendingCount);

    if (supplyFull) {
      console.warn(
        `[check-booking-capacity] CAPACITY_CHECK_REJECTED community=${community_name} pending=${pendingCount} online=${onlineWorkers}`,
      );
      return json({
        can_accept_booking: false,
        reason: "supply_full",
        pending_count: pendingCount,
        online_workers: onlineWorkers,
        available_workers: availableWorkers,
      });
    }

    console.log(
      `[check-booking-capacity] CAPACITY_CHECK_PASSED community=${community_name} pending=${pendingCount} known=${pendingKnown} online=${onlineWorkers}`,
    );
    return json({
      can_accept_booking: true,
      reason: pendingKnown ? null : "supply_unknown_fail_open",
      pending_count: pendingCount,
      online_workers: onlineWorkers,
      available_workers: availableWorkers,
    });
  } catch (err) {
    // Fail-open: a broken capacity check must never block legitimate bookings;
    // the DB trigger remains the authoritative guard.
    console.error("[check-booking-capacity] fatal (fail-open):", err);
    return json({
      can_accept_booking: true,
      reason: "check_failed_fail_open",
      pending_count: 0,
      online_workers: 0,
      available_workers: 0,
    });
  }
});
