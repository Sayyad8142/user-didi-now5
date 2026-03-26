import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Platform fee percentage (e.g., 20%)
const PLATFORM_FEE_PERCENT = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate worker
    const idToken = extractToken(req);
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firebaseUser = await verifyFirebaseToken(idToken);

    // 2. Parse request
    const { booking_id, otp } = await req.json();
    if (!booking_id || !otp) {
      return new Response(JSON.stringify({ error: "booking_id and otp required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Map firebase_uid to worker profile
    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (!worker) {
      return new Response(JSON.stringify({ error: "Worker not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Get booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, status, worker_id, completion_otp, otp_verified_at, payment_status, payment_amount_inr, price_inr")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Verify worker is assigned
    if (booking.worker_id !== worker.id) {
      return new Response(JSON.stringify({ error: "You are not assigned to this booking" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Check booking is not already completed/cancelled
    if (booking.status === "completed") {
      return new Response(JSON.stringify({ error: "Booking already completed" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Booking is cancelled" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Check OTP not already used
    if (booking.otp_verified_at) {
      return new Response(JSON.stringify({ error: "OTP already used" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Verify OTP matches
    if (booking.completion_otp !== otp.toString().trim()) {
      return new Response(JSON.stringify({ error: "Invalid OTP" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 9. Calculate payout
    const grossAmount = booking.payment_amount_inr || booking.price_inr || 0;
    const platformFee = Math.round(grossAmount * PLATFORM_FEE_PERCENT / 100);
    const netAmount = grossAmount - platformFee;

    // 10. Atomically complete booking
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("bookings")
      .update({
        status: "completed",
        otp_verified_at: now,
        otp_verified_by_worker_id: worker.id,
        worker_payout_status: "pending",
        worker_payout_amount: netAmount,
        platform_fee_amount: platformFee,
        payment_status: "settled_to_worker",
      })
      .eq("id", booking_id)
      .is("otp_verified_at", null); // Prevent race condition

    if (updateErr) {
      console.error("Failed to complete booking:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to complete booking" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 11. Create worker payout record
    await supabase.from("worker_payouts").insert({
      booking_id,
      worker_id: worker.id,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      status: "pending",
      notes: `OTP verified at ${now}`,
    });

    console.log(`✅ Booking ${booking_id} completed by worker ${worker.id}, payout: ₹${netAmount}`);

    return new Response(JSON.stringify({
      success: true,
      booking_id,
      payout: {
        gross: grossAmount,
        platform_fee: platformFee,
        net: netAmount,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("complete-booking-with-otp error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
