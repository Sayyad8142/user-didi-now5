import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Platform fee percentage (e.g., 20%)
const PLATFORM_FEE_PERCENT = 20;

// OTP rate limiting
const MAX_OTP_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 10;

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
      .select("id, status, worker_id, completion_otp, otp_verified_at, payment_status, payment_amount_inr, price_inr, payment_method, worker_collected_payment")
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

    // 9. STRICT PAYMENT VALIDATION — block completion if payment not received
    const isPayAfterService = booking.payment_method === "pay_after_service";

    if (isPayAfterService) {
      // Pay After Service: worker must have collected cash
      if (!booking.worker_collected_payment) {
        return new Response(JSON.stringify({
          error: "Please collect payment from customer before completing the job.",
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Online payment (Razorpay / wallet): must be paid
      const paymentOk = ["paid", "settled_to_worker"].includes(booking.payment_status ?? "");
      if (!paymentOk) {
        console.warn(`🚫 Booking ${booking_id} blocked: payment_status=${booking.payment_status}`);
        return new Response(JSON.stringify({
          error: "Payment not completed. Please ask customer to complete payment.",
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 10. Calculate payout
    const grossAmount = booking.payment_amount_inr || booking.price_inr || 0;
    const platformFee = Math.round(grossAmount * PLATFORM_FEE_PERCENT / 100);
    const netAmount = grossAmount - platformFee;

    // 11. Atomically complete booking
    const now = new Date().toISOString();

    const { data: updatedRows, error: updateErr } = await supabase
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
      .is("otp_verified_at", null)
      .select("id");

    if (updateErr) {
      console.error("Failed to complete booking:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to complete booking" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no rows updated, booking was already completed (race condition)
    if (!updatedRows || updatedRows.length === 0) {
      console.warn(`⚠️ Booking ${booking_id} was already completed (no rows updated)`);
      return new Response(JSON.stringify({ error: "Booking already completed" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 12. Create worker payout record (fully idempotent)
    let payoutId: string | null = null;
    let payoutRecord = { gross: grossAmount, platform_fee: platformFee, net: netAmount };

    if (netAmount > 0) {
      // Step A: check if payout already exists
      const { data: existingPayout } = await supabase
        .from("worker_payouts")
        .select("id, booking_amount, platform_fee, payout_amount")
        .eq("booking_id", booking_id)
        .eq("worker_id", worker.id)
        .maybeSingle();

      if (existingPayout) {
        // Already exists — return it, no insert
        payoutId = existingPayout.id;
        payoutRecord = {
          gross: existingPayout.booking_amount,
          platform_fee: existingPayout.platform_fee,
          net: existingPayout.payout_amount,
        };
        console.log(`ℹ️ Payout already exists for booking ${booking_id}: ${payoutId}`);
      } else {
        // Step B: attempt insert
        const { data: newPayout, error: payoutErr } = await supabase
          .from("worker_payouts")
          .insert({
            booking_id,
            worker_id: worker.id,
            booking_amount: grossAmount,
            platform_fee: platformFee,
            payout_amount: netAmount,
            status: "pending",
            admin_notes: `OTP verified at ${now}. Payment: ${booking.payment_method || "razorpay"}`,
          })
          .select("id")
          .single();

        if (payoutErr) {
          if (payoutErr.code === "23505") {
            // Step C: concurrent insert won the race — fetch the winner
            const { data: raceWinner } = await supabase
              .from("worker_payouts")
              .select("id, booking_amount, platform_fee, payout_amount")
              .eq("booking_id", booking_id)
              .eq("worker_id", worker.id)
              .maybeSingle();

            if (raceWinner) {
              payoutId = raceWinner.id;
              payoutRecord = {
                gross: raceWinner.booking_amount,
                platform_fee: raceWinner.platform_fee,
                net: raceWinner.payout_amount,
              };
            }
            console.log(`ℹ️ Concurrent payout resolved for booking ${booking_id}: ${payoutId}`);
          } else {
            console.error("Failed to create payout record:", payoutErr);
            // Don't fail — booking is already completed
          }
        } else {
          payoutId = newPayout?.id ?? null;
        }
      }
    }

    console.log(`✅ Booking ${booking_id} completed by worker ${worker.id}, payout: ₹${netAmount}, payout_id: ${payoutId}`);

    return new Response(JSON.stringify({
      success: true,
      booking_id,
      payout_id: payoutId,
      payout: payoutRecord,
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
