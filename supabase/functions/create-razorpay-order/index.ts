import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Get booking from DB
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Map firebase_uid to profile
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

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, user_id, price_inr, payment_status, razorpay_order_id, cust_name, cust_phone, service_type, wallet_used_amount, razorpay_paid_amount")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Verify booking belongs to user
    if (booking.user_id !== profile.id) {
      return new Response(JSON.stringify({ error: "Booking does not belong to user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Prevent duplicate order creation if already paid
    if (booking.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "Booking already paid" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. If order already exists and not yet paid, return existing order
    if (booking.razorpay_order_id && booking.payment_status === "order_created") {
      // Use razorpay_paid_amount if set (partial wallet payment), otherwise full price
      const existingAmount = (booking.razorpay_paid_amount ?? booking.price_inr!) * 100;
      return new Response(JSON.stringify({
        order_id: booking.razorpay_order_id,
        amount: existingAmount,
        currency: "INR",
        key_id: RAZORPAY_KEY_ID,
        booking_id: booking.id,
        prefill: {
          name: booking.cust_name,
          contact: booking.cust_phone,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Server-side price validation
    const amountInPaise = booking.price_inr! * 100;
    if (amountInPaise <= 0) {
      return new Response(JSON.stringify({ error: "Invalid booking amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Create Razorpay order
    const authHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: booking.id,
        notes: {
          booking_id: booking.id,
          service_type: booking.service_type,
          user_id: booking.user_id,
        },
      }),
    });

    if (!rpRes.ok) {
      const errText = await rpRes.text();
      console.error("Razorpay order creation failed:", rpRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to create payment order" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpOrder = await rpRes.json();

    // 9. Update booking with order info
    await supabase
      .from("bookings")
      .update({
        razorpay_order_id: rpOrder.id,
        payment_status: "order_created",
        payment_amount_inr: booking.price_inr,
      })
      .eq("id", booking.id);

    // 10. Return order details to frontend
    return new Response(JSON.stringify({
      order_id: rpOrder.id,
      amount: amountInPaise,
      currency: "INR",
      key_id: RAZORPAY_KEY_ID,
      booking_id: booking.id,
      prefill: {
        name: booking.cust_name,
        contact: booking.cust_phone,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("create-razorpay-order error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
