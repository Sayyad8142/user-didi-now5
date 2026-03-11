import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken } from "../_shared/verifyFirebaseToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("Missing Razorpay credentials");
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
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("firebase_uid", firebaseUid)
      .single();

    if (profileError || !profile) {
      console.error("Profile not found for firebase_uid:", firebaseUid);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { booking_id, booking_data, amount } = body;

    // ========== FLOW A: Intent-based (instant bookings — no booking row yet) ==========
    if (booking_data && amount) {
      console.log("📦 Intent-based order flow, amount:", amount);

      const amountInPaise = amount * 100;
      if (amountInPaise <= 0) {
        return new Response(JSON.stringify({ error: "Invalid amount" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create Razorpay order
      const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
      const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: `intent_${Date.now()}`,
          notes: {
            user_id: profile.id,
            flow: "intent",
          },
        }),
      });

      const rzpBody = await rzpResponse.text();
      if (!rzpResponse.ok) {
        console.error("Razorpay order creation failed:", rzpBody);
        return new Response(JSON.stringify({ error: "Failed to create payment order" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rzpOrder = JSON.parse(rzpBody);

      // Store payment intent
      const { error: intentError } = await supabase
        .from("payment_intents")
        .insert({
          user_id: profile.id,
          razorpay_order_id: rzpOrder.id,
          amount_inr: amount,
          booking_data: booking_data,
          status: "pending",
        });

      if (intentError) {
        console.error("Failed to save payment intent:", intentError);
        return new Response(JSON.stringify({ error: "Failed to save payment intent" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`✅ Intent-based Razorpay order created: ${rzpOrder.id}`);

      return new Response(
        JSON.stringify({
          order_id: rzpOrder.id,
          amount: amountInPaise,
          currency: "INR",
          key_id: razorpayKeyId,
          flow: "intent",
          prefill: {
            name: profile.full_name,
            contact: profile.phone,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ========== FLOW B: Legacy booking-based flow (scheduled bookings) ==========
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id or booking_data required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, price_inr, user_id, payment_status, cust_name, cust_phone, community")
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

    if (booking.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "Already paid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountInPaise = (booking.price_inr || 0) * 100;
    if (amountInPaise <= 0) {
      return new Response(JSON.stringify({ error: "Invalid booking amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const credentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: booking_id,
        notes: {
          booking_id,
          community: booking.community,
          customer: booking.cust_name,
        },
      }),
    });

    const rzpBody = await rzpResponse.text();
    if (!rzpResponse.ok) {
      console.error("Razorpay order creation failed:", rzpBody);
      return new Response(JSON.stringify({ error: "Failed to create payment order" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rzpOrder = JSON.parse(rzpBody);

    await supabase
      .from("bookings")
      .update({
        razorpay_order_id: rzpOrder.id,
        payment_status: "order_created",
      })
      .eq("id", booking_id);

    console.log(`✅ Razorpay order created: ${rzpOrder.id} for booking ${booking_id}`);

    return new Response(
      JSON.stringify({
        order_id: rzpOrder.id,
        amount: amountInPaise,
        currency: "INR",
        key_id: razorpayKeyId,
        booking_id,
        flow: "booking",
        prefill: {
          name: booking.cust_name,
          contact: booking.cust_phone,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("create-razorpay-order error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
