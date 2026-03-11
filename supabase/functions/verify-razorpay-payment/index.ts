import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken } from "../_shared/verifyFirebaseToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${orderId}|${paymentId}`);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const firebaseToken = req.headers.get("x-firebase-token");
    if (!firebaseToken) {
      console.error("Missing x-firebase-token header");
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!razorpayKeySecret) {
      return new Response(JSON.stringify({ error: "Payment service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify Firebase token
    let firebaseUid: string;
    try {
      const decoded = await verifyFirebaseToken(firebaseToken);
      firebaseUid = decoded.uid;
      console.log("✅ Firebase token verified for uid:", firebaseUid);
    } catch (e) {
      console.error("❌ Firebase token verification failed:", e.message);
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing required payment fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Razorpay signature first (common to both flows)
    const isValid = await verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpayKeySecret
    );

    if (!isValid) {
      console.error("❌ Razorpay signature verification failed");
      // Mark any matching intent as failed
      await supabase
        .from("payment_intents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("razorpay_order_id", razorpay_order_id)
        .eq("user_id", profile.id)
        .eq("status", "pending");
      return new Response(JSON.stringify({ error: "Payment verification failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("✅ Razorpay signature verified for order:", razorpay_order_id);

    // ========== Check if this is an intent-based flow ==========
    const { data: intent } = await supabase
      .from("payment_intents")
      .select("*")
      .eq("razorpay_order_id", razorpay_order_id)
      .eq("user_id", profile.id)
      .eq("status", "pending")
      .maybeSingle();

    if (intent) {
      // ========== FLOW A: Intent-based — create booking now ==========
      console.log("📦 Intent-based verification, creating booking from intent:", intent.id);

      const bd = intent.booking_data as Record<string, unknown>;

      // Create the real booking row with payment already confirmed
      const { data: newBooking, error: insertError } = await supabase
        .from("bookings")
        .insert({
          ...bd,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          payment_status: "paid",
          payment_method: "razorpay",
          paid_confirmed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("❌ Failed to create booking from intent:", insertError);
        return new Response(JSON.stringify({ error: "Failed to create booking: " + insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark intent as completed with payment details
      await supabase
        .from("payment_intents")
        .update({
          status: "completed",
          razorpay_payment_id,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.id);

      console.log(`✅ Booking ${newBooking.id} created from intent after payment verification`);

      return new Response(
        JSON.stringify({ success: true, booking_id: newBooking.id, payment_id: razorpay_payment_id, flow: "intent" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ========== FLOW B: Legacy booking-based flow ==========
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "No matching payment intent or booking_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, user_id, razorpay_order_id, payment_status")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.id !== booking.user_id) {
      return new Response(JSON.stringify({ error: "Not your booking" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.razorpay_order_id !== razorpay_order_id) {
      console.error("Order ID mismatch:", { expected: booking.razorpay_order_id, got: razorpay_order_id });
      return new Response(JSON.stringify({ error: "Order ID mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.payment_status === "paid") {
      return new Response(JSON.stringify({ success: true, message: "Already verified" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update booking with payment info
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        razorpay_payment_id,
        razorpay_signature,
        payment_status: "paid",
        payment_method: "razorpay",
        paid_confirmed_at: new Date().toISOString(),
      })
      .eq("id", booking_id);

    if (updateError) {
      console.error("Failed to update booking after payment:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update booking" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Payment verified for booking ${booking_id}, payment: ${razorpay_payment_id}`);

    return new Response(
      JSON.stringify({ success: true, booking_id, payment_id: razorpay_payment_id, flow: "booking" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("verify-razorpay-payment error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
