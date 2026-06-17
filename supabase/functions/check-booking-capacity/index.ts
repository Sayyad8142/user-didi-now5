/**
 * check-booking-capacity — Pre-payment capacity gate (V2).
 *
 * Called by the frontend BEFORE creating a Razorpay order so users
 * are never charged when the per-service instant supply cap is full.
 *
 * Source of truth: EXTERNAL Supabase (api.didisnow.com) where the
 * real `bookings` table lives. Mirrors the DB trigger rule defined
 * in docs/service-capacity-migration.sql.
 *
 * Counting rule:
 *   SELECT count(*) FROM bookings
 *   WHERE community     = $1
 *     AND service_type  = $2
 *     AND booking_type  = 'instant'
 *     AND status IN ('pending','dispatched','accepted',
 *                    'confirmed','on_the_way','in_progress');
 *
 * Scheduled bookings are excluded (booking_type filter).
 * FAIL-CLOSED: any error blocks payment.
 */
import {
  countActiveInstantBookings,
  limitForService,
} from "../_shared/capacityRules.ts";

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

  const { community_name, service_type, booking_type } = await req
    .json()
    .catch(() => ({}));

  console.log(
    `[check-booking-capacity] capacity_gate_checked community=${community_name} service=${service_type} type=${booking_type}`,
  );

  // Scheduled bookings are governed by slot availability, not the instant cap.
  if (booking_type && booking_type !== "instant") {
    return json({
      can_accept_booking: true,
      reason: null,
      service_type,
      pending_count: 0,
      limit: 0,
    });
  }

  if (!community_name || !service_type) {
    // FAIL-CLOSED: a malformed check must block payment, not allow it.
    console.warn(
      "[check-booking-capacity] capacity_gate_blocked reason=missing_inputs",
    );
    return json(
      {
        can_accept_booking: false,
        reason: "missing_inputs",
        message: "Currently all experts are busy. Please try again after 20 minutes.",
        pending_count: 0,
        limit: limitForService(service_type),
      },
      200,
    );
  }

  try {
    const result = await countActiveInstantBookings(community_name, service_type);

    if (result.is_full) {
      console.warn(
        `[check-booking-capacity] capacity_gate_blocked community=${community_name} service=${service_type} active=${result.active_count} limit=${result.limit}`,
      );
      return json({
        can_accept_booking: false,
        reason: "supply_full",
        message: "Currently all experts are busy. Please try again after 20 minutes.",
        service_type,
        pending_count: result.active_count,
        limit: result.limit,
      });
    }

    console.log(
      `[check-booking-capacity] capacity_gate_passed community=${community_name} service=${service_type} active=${result.active_count}/${result.limit}`,
    );
    return json({
      can_accept_booking: true,
      reason: null,
      service_type,
      pending_count: result.active_count,
      limit: result.limit,
    });
  } catch (err) {
    // FAIL-CLOSED: payment must NEVER start when we can't verify capacity.
    console.error(
      "[check-booking-capacity] capacity_gate_blocked reason=check_failed",
      (err as Error).message,
    );
    return json(
      {
        can_accept_booking: false,
        reason: "check_failed",
        message:
          "We couldn't confirm expert availability. Please try again in a moment.",
        pending_count: 0,
        limit: limitForService(service_type),
      },
      200,
    );
  }
});
