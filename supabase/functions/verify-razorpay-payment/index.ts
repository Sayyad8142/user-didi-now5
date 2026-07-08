import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY,
  FUNCTIONS_BASE_URL,
} from "../_shared/externalSupabaseEnv.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
// bookings + profiles live on the EXTERNAL DB.
const SUPABASE_URL = EXTERNAL_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;
const DISPATCH_BASE_URL = FUNCTIONS_BASE_URL || SUPABASE_URL;

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
    const {
      booking_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    if (!booking_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
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

    // 4. Get booking
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

    // 5. Verify booking belongs to user
    if (booking.user_id !== profile.id) {
      return new Response(JSON.stringify({ error: "Booking does not belong to user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Prevent duplicate verification
    if (booking.payment_status === "paid") {
      return new Response(JSON.stringify({ success: true, message: "Already verified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Verify order ID matches
    if (booking.razorpay_order_id !== razorpay_order_id) {
      return new Response(JSON.stringify({ error: "Order ID mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. HMAC signature verification
    const expectedData = `${razorpay_order_id}|${razorpay_payment_id}`;
    const isValid = await hmacSha256Verify(expectedData, razorpay_signature, RAZORPAY_KEY_SECRET);

    if (!isValid) {
      console.error("HMAC verification failed for booking:", booking_id);
      await supabase
        .from("bookings")
        .update({ payment_status: "failed" })
        .eq("id", booking_id);

      return new Response(JSON.stringify({ error: "Payment verification failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 9. Mark booking as paid
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

    // 10. TRIGGER DISPATCH — only for instant bookings (modern flow only)
    if (booking.booking_type === "instant") {
      console.log(`[DISPATCH_FLOW_DEBUG][verify-razorpay-payment] booking=${booking_id} type=instant → dispatch-pending-bookings`);
      try {
        await fetch(`${DISPATCH_BASE_URL}/functions/v1/dispatch-pending-bookings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ booking_id }),
        });
        console.log(`✅ Dispatch triggered via edge function for ${booking_id}`);
      } catch (dispatchCatchErr) {
        console.error("Dispatch trigger error (non-blocking):", dispatchCatchErr);
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
