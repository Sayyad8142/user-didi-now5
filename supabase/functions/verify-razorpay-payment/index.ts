import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function hmacSha256Verify(data: string, signature: string, secret: string): Promise<boolean> {
  return (async () => {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return computed === signature;
  })();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate user
    const idToken = extractToken(req);
    if (!idToken) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firebaseUser = await verifyFirebaseToken(idToken);

    // 2. Parse request
    const body = await req.json();
    const {
      booking_id,
      booking_data,
      wallet_amount,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing required razorpay fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!booking_id && !booking_data) {
      return new Response(JSON.stringify({ error: "booking_id or booking_data required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Map firebase_uid to profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. HMAC signature verification
    const expectedData = `${razorpay_order_id}|${razorpay_payment_id}`;
    const isValid = await hmacSha256Verify(expectedData, razorpay_signature, RAZORPAY_KEY_SECRET);

    if (!isValid) {
      console.error("HMAC verification failed");
      // If legacy mode with booking_id, mark as failed
      if (booking_id) {
        await supabase
          .from("bookings")
          .update({ payment_status: "failed" })
          .eq("id", booking_id);
      }
      return new Response(JSON.stringify({ error: "Payment verification failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE A: Payment-first — create booking after payment verified ──
    if (booking_data) {
      // Verify user_id matches authenticated user
      if (booking_data.user_id !== profile.id) {
        return new Response(JSON.stringify({ error: "User mismatch in booking data" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotency: check if booking already created for this Razorpay order
      const { data: existingBooking } = await supabase
        .from("bookings")
        .select("id")
        .eq("razorpay_order_id", razorpay_order_id)
        .maybeSingle();

      if (existingBooking) {
        console.log(`✅ Idempotent: booking ${existingBooking.id} already exists for order ${razorpay_order_id}`);
        return new Response(JSON.stringify({
          success: true,
          booking_id: existingBooking.id,
          payment_id: razorpay_payment_id,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculate amounts
      const walletUsed = wallet_amount || 0;
      const razorpayPaid = booking_data.price_inr - walletUsed;

      // Remove any client-set payment fields — we set them server-side
      const cleanBookingData = { ...booking_data };
      delete cleanBookingData.payment_status;
      delete cleanBookingData.payment_method;

      // Insert booking with verified payment info
      const { data: newBooking, error: insertErr } = await supabase
        .from("bookings")
        .insert([{
          ...cleanBookingData,
          payment_status: "paid",
          payment_method: walletUsed > 0 ? "wallet+razorpay" : "razorpay",
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          paid_at: new Date().toISOString(),
          wallet_used_amount: walletUsed > 0 ? walletUsed : null,
          razorpay_paid_amount: razorpayPaid,
          payment_amount_inr: booking_data.price_inr,
        }])
        .select("id, booking_type");

      if (insertErr) {
        console.error("❌ Booking creation failed after payment:", insertErr);
        return new Response(JSON.stringify({ error: "Failed to create booking: " + insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newBookingId = newBooking![0].id;
      const bookingType = newBooking![0].booking_type;
      console.log(`✅ Payment verified + booking ${newBookingId} created (payment-first)`);

      // Wallet debit if needed
      if (walletUsed > 0) {
        try {
          const { error: walletErr } = await supabase.rpc("debit_wallet_for_booking", {
            p_user_id: profile.id,
            p_booking_id: newBookingId,
            p_amount: 0,
          });
          if (walletErr) {
            console.error("Wallet debit RPC failed (non-blocking):", walletErr.message);
          } else {
            console.log(`💰 Wallet debited ${walletUsed} for booking ${newBookingId}`);
          }
        } catch (walletCatchErr: any) {
          console.error("Wallet debit error (non-blocking):", walletCatchErr.message);
        }
      }

      // Dispatch for instant bookings
      if (bookingType === "instant") {
        console.log(`🚀 Triggering dispatch for instant booking ${newBookingId}...`);
        try {
          const { error: dispatchErr } = await supabase.rpc("dispatch_booking", {
            p_booking_id: newBookingId,
          });
          if (dispatchErr) {
            console.error("dispatch_booking RPC failed, trying edge function:", dispatchErr);
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/scheduled-dispatch`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({ booking_id: newBookingId }),
              });
            } catch (fallbackErr) {
              console.error("Edge function dispatch fallback failed:", fallbackErr);
            }
          } else {
            console.log(`✅ Dispatch triggered for ${newBookingId}`);
          }
        } catch (dispatchCatchErr) {
          console.error("Dispatch error (non-blocking):", dispatchCatchErr);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        booking_id: newBookingId,
        payment_id: razorpay_payment_id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE B: Legacy — update existing booking ──
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, user_id, razorpay_order_id, payment_status, payment_amount_inr, status, booking_type")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.user_id !== profile.id) {
      return new Response(JSON.stringify({ error: "Booking does not belong to user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.payment_status === "paid") {
      return new Response(JSON.stringify({ success: true, message: "Already verified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.razorpay_order_id !== razorpay_order_id) {
      return new Response(JSON.stringify({ error: "Order ID mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark booking as paid
    const { error: updateErr } = await supabase
      .from("bookings")
      .update({
        payment_status: "paid",
        razorpay_payment_id,
        razorpay_signature,
        paid_at: new Date().toISOString(),
        payment_method: "razorpay",
      })
      .eq("id", booking_id);

    if (updateErr) {
      console.error("Failed to update booking payment:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to update booking" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Payment verified for booking ${booking_id}, payment: ${razorpay_payment_id}`);

    // Dispatch for instant bookings
    if (booking.booking_type === "instant") {
      console.log(`🚀 Triggering dispatch for instant booking ${booking_id}...`);
      try {
        const { error: dispatchErr } = await supabase.rpc("dispatch_booking", {
          p_booking_id: booking_id,
        });
        if (dispatchErr) {
          console.error("dispatch_booking RPC failed, trying edge function:", dispatchErr);
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/scheduled-dispatch`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ booking_id }),
            });
          } catch (fallbackErr) {
            console.error("Edge function dispatch fallback failed:", fallbackErr);
          }
        } else {
          console.log(`✅ Dispatch triggered via RPC for ${booking_id}`);
        }
      } catch (dispatchCatchErr) {
        console.error("Dispatch error (non-blocking):", dispatchCatchErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      booking_id,
      payment_id: razorpay_payment_id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("verify-razorpay-payment error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
