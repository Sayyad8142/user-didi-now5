/**
 * Razorpay Webhook Handler
 * 
 * Receives Razorpay webhook events and reconciles payment status.
 * This is the safety net for cases where:
 * - User's app crashes after payment but before verify call
 * - Network drops during verification
 * - Frontend fails to call verify endpoint
 * 
 * Events handled:
 * - payment.captured  → marks booking as paid, triggers dispatch
 * - payment.failed    → marks booking payment as failed
 * - order.paid        → fallback for order-level confirmation
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
};

/**
 * Verify Razorpay webhook signature using HMAC-SHA256
 */
async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!secret || !signature) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const logPrefix = "[razorpay-webhook]";

  try {
    console.log("🔥 Razorpay webhook received:", new Date().toISOString());

    // 1. Read raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";

    console.log(`${logPrefix} Received webhook, signature present: ${!!signature}`);

    // 2. Verify signature
    if (RAZORPAY_WEBHOOK_SECRET) {
      const isValid = await verifyWebhookSignature(rawBody, signature, RAZORPAY_WEBHOOK_SECRET);
      if (!isValid) {
        console.error(`${logPrefix} ❌ Webhook signature verification failed`);
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`${logPrefix} ✅ Signature verified`);
    } else {
      console.warn(`${logPrefix} ⚠️ RAZORPAY_WEBHOOK_SECRET not set, skipping signature verification`);
    }

    // 3. Parse event
    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const payload = event.payload;

    console.log(`${logPrefix} Event: ${eventType}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Handle events
    if (eventType === "payment.captured" || eventType === "order.paid") {
      const payment = payload.payment?.entity;
      if (!payment) {
        console.error(`${logPrefix} No payment entity in payload`);
        return new Response(JSON.stringify({ status: "no_payment_entity" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const razorpayOrderId = payment.order_id;
      const razorpayPaymentId = payment.id;
      const amountInPaise = payment.amount;

      console.log(`${logPrefix} Payment captured: ${razorpayPaymentId}, order: ${razorpayOrderId}, amount: ${amountInPaise}`);

      // Find booking by razorpay_order_id
      const { data: booking, error: findErr } = await supabase
        .from("bookings")
        .select("id, payment_status, booking_type, status")
        .eq("razorpay_order_id", razorpayOrderId)
        .maybeSingle();

      if (findErr) {
        console.error(`${logPrefix} DB error finding booking:`, findErr);
      }

      if (!booking) {
        // ORPHAN PAYMENT - no booking found for this order
        console.warn(`${logPrefix} ⚠️ ORPHAN PAYMENT: No booking for order ${razorpayOrderId}`);
        
        // Extract user info from notes if available
        const userId = payment.notes?.user_id || null;

        await supabase.from("orphan_payments").insert({
          razorpay_payment_id: razorpayPaymentId,
          razorpay_order_id: razorpayOrderId,
          amount_inr: amountInPaise / 100,
          currency: payment.currency || "INR",
          user_id: userId,
          status: "unmapped",
          notes: `Webhook event: ${eventType}. No booking found.`,
          webhook_payload: event,
        });

        return new Response(JSON.stringify({ status: "orphan_logged" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If already paid, skip (idempotent)
      if (booking.payment_status === "paid") {
        console.log(`${logPrefix} Booking ${booking.id} already paid, skipping`);
        return new Response(JSON.stringify({ status: "already_paid" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark as paid
      const { error: updateErr } = await supabase
        .from("bookings")
        .update({
          payment_status: "paid",
          razorpay_payment_id: razorpayPaymentId,
          paid_at: new Date().toISOString(),
          payment_method: "razorpay",
        })
        .eq("id", booking.id);

      if (updateErr) {
        console.error(`${logPrefix} Failed to update booking ${booking.id}:`, updateErr);
        return new Response(JSON.stringify({ error: "update_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`${logPrefix} ✅ Booking ${booking.id} marked as paid via webhook`);

      // Trigger dispatch for instant bookings that haven't been dispatched yet
      if (booking.booking_type === "instant" && booking.status === "pending") {
        console.log(`${logPrefix} 🚀 Triggering dispatch for instant booking ${booking.id}`);
        try {
          const { error: dispatchErr } = await supabase.rpc("dispatch_booking", {
            p_booking_id: booking.id,
          });
          if (dispatchErr) {
            console.error(`${logPrefix} dispatch_booking RPC failed:`, dispatchErr);
            // Fallback to edge function
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/scheduled-dispatch`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({ booking_id: booking.id }),
              });
              console.log(`${logPrefix} ✅ Dispatch via edge function fallback`);
            } catch (fallbackErr) {
              console.error(`${logPrefix} Edge function fallback also failed:`, fallbackErr);
            }
          } else {
            console.log(`${logPrefix} ✅ Dispatch triggered via RPC`);
          }
        } catch (dispatchCatchErr) {
          console.error(`${logPrefix} Dispatch error (non-blocking):`, dispatchCatchErr);
        }
      }

      return new Response(JSON.stringify({ status: "payment_reconciled", booking_id: booking.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (eventType === "payment.failed") {
      const payment = payload.payment?.entity;
      if (!payment) {
        return new Response(JSON.stringify({ status: "no_payment_entity" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const razorpayOrderId = payment.order_id;
      console.log(`${logPrefix} Payment failed for order: ${razorpayOrderId}`);

      // Find booking and mark as failed (only if not already paid)
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, payment_status")
        .eq("razorpay_order_id", razorpayOrderId)
        .maybeSingle();

      if (booking && booking.payment_status !== "paid") {
        await supabase
          .from("bookings")
          .update({ payment_status: "failed" })
          .eq("id", booking.id);
        console.log(`${logPrefix} Booking ${booking.id} marked as failed`);
      }

      return new Response(JSON.stringify({ status: "failure_recorded" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      // Unhandled event type - acknowledge anyway
      console.log(`${logPrefix} Unhandled event type: ${eventType}, acknowledged`);
      return new Response(JSON.stringify({ status: "acknowledged" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err: any) {
    console.error(`${logPrefix} Error:`, err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
