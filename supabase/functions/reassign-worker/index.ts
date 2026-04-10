/**
 * reassign-worker — Called when user taps "Change Worker".
 *
 * 1. Cancels all active assignments for the booking
 * 2. Marks all pending booking_requests as 'cancelled' (old worker stays excluded via ON CONFLICT)
 * 3. Resets booking to pending with worker fields cleared
 * 4. Calls dispatch_booking() RPC — the SAME path used for fresh instant bookings
 *
 * The old worker is automatically excluded from the next dispatch round because
 * their booking_requests row still exists (dispatch_booking uses NOT EXISTS check).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  verifyFirebaseToken,
  extractToken,
  corsHeaders,
} from "../_shared/firebaseAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Missing auth token" }, 401);

    const firebaseUser = await verifyFirebaseToken(idToken);
    if (!firebaseUser?.uid) return json({ error: "Invalid token" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (!profile) return json({ error: "Profile not found" }, 404);

    // ── Parse body ──
    const { booking_id } = await req.json();
    if (!booking_id) return json({ error: "Missing booking_id" }, 400);

    // ── Verify booking belongs to user and is in a reassignable state ──
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, status, user_id, worker_id")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) return json({ error: "Booking not found" }, 404);
    if (booking.user_id !== profile.id) return json({ error: "Not your booking" }, 403);

    const reassignableStatuses = ["assigned", "accepted", "on_the_way"];
    if (!reassignableStatuses.includes(booking.status)) {
      return json({ error: `Cannot change worker in status: ${booking.status}` }, 400);
    }

    // ── Check assignment count limit (max 1 change = max 2 assignments) ──
    const { count: assignmentCount } = await supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking_id);

    if ((assignmentCount ?? 0) >= 2) {
      return json({ error: "Worker change limit reached" }, 400);
    }

    console.log(`[reassign-worker] Reassigning booking ${booking_id}, current status: ${booking.status}`);

    // ── Step 1: Cancel ALL active assignments (not just 'assigned') ──
    const { error: cancelAssignErr } = await supabase
      .from("assignments")
      .update({ status: "cancelled" })
      .eq("booking_id", booking_id)
      .in("status", ["assigned", "accepted", "on_the_way", "started"]);

    if (cancelAssignErr) {
      console.error("[reassign-worker] Cancel assignments error:", cancelAssignErr);
      return json({ error: "Failed to cancel assignment" }, 500);
    }

    // ── Step 2: Cancel all pending/sent booking_requests ──
    // Old worker's row stays in table → dispatch_booking's NOT EXISTS excludes them
    const { error: cancelReqErr } = await supabase
      .from("booking_requests")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("booking_id", booking_id)
      .in("status", ["pending", "sent"]);

    if (cancelReqErr) {
      console.error("[reassign-worker] Cancel booking_requests error:", cancelReqErr);
      // Non-fatal — continue
    }

    // ── Step 3: Reset booking to pending ──
    const { error: resetErr } = await supabase
      .from("bookings")
      .update({
        status: "pending",
        worker_id: null,
        worker_name: null,
        worker_phone: null,
        worker_photo_url: null,
        worker_upi: null,
        assigned_at: null,
      })
      .eq("id", booking_id);

    if (resetErr) {
      console.error("[reassign-worker] Reset booking error:", resetErr);
      return json({ error: "Failed to reset booking" }, 500);
    }

    // ── Step 4: Call dispatch_booking() — same path as fresh instant bookings ──
    const { error: dispatchErr } = await supabase.rpc("dispatch_booking", {
      p_booking_id: booking_id,
    });

    if (dispatchErr) {
      console.error("[reassign-worker] dispatch_booking RPC error:", dispatchErr);
      return json({
        ok: true,
        warning: "Booking reset but dispatch failed — workers will be notified shortly",
      });
    }

    console.log(`[reassign-worker] ✅ Booking ${booking_id} reassigned and dispatched`);
    return json({ ok: true });
  } catch (err) {
    console.error("[reassign-worker] Error:", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
