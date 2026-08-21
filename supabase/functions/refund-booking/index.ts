// Edge function: refund-booking
// Universal, immediate refund endpoint for EVERY cancellation source that
// isn't the user app (admin app, worker app, dispatch/no-worker timeouts,
// scheduled jobs). It calls the same canonical resolver used by
// cancel-booking, so no path depends on the hourly sla-checker sweep.
//
// Auth: service-to-service. Callers must send the shared service role key of
// the external project in `x-service-key` (or Authorization: Bearer <key>).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/externalSupabaseEnv.ts";
import { refundBookingToWallet } from "../_shared/refundAmount.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-service-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Server misconfigured" }, 500);
    }

    const presented =
      req.headers.get("x-service-key") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

    if (presented !== EXTERNAL_SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({} as any));
    const bookingId: string | undefined = body?.booking_id;
    const reason: string =
      typeof body?.reason === "string" && body.reason ? body.reason.slice(0, 100) : "cancelled";
    if (!bookingId) return json({ error: "booking_id required" }, 400);

    const admin = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: booking, error } = await admin
      .from("bookings")
      .select("id, user_id, status, cancelled_at, otp_verified_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!booking) return json({ error: "booking_not_found" }, 404);
    if (!booking.user_id) return json({ error: "booking_without_user" }, 409);
    if (booking.otp_verified_at) return json({ skipped: true, reason: "otp_verified" });
    if (booking.status !== "cancelled" && !booking.cancelled_at) {
      return json({ error: "booking_not_cancelled" }, 409);
    }

    const refund = await refundBookingToWallet(
      admin,
      bookingId,
      booking.user_id as string,
      reason,
    );
    console.log("[refund-booking]", bookingId, reason, JSON.stringify(refund));

    return json({ success: true, refund });
  } catch (err) {
    console.error("[refund-booking] unhandled", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
