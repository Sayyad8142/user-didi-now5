/**
 * check-razorpay-order — Checks if a Razorpay order has been paid.
 *
 * Called after the user dismisses the Razorpay checkout overlay
 * (common with QR payments where the overlay can't detect completion).
 *
 * Returns the first successful payment for the order, if any.
 */
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const idToken = extractToken(req);
    if (!idToken) return json({ error: "Not authenticated" }, 401);
    await verifyFirebaseToken(idToken);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id required" }, 400);

    // Fetch payments for this order from Razorpay
    const authHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const rpRes = await fetch(`https://api.razorpay.com/v1/orders/${order_id}/payments`, {
      headers: { Authorization: authHeader },
    });

    if (!rpRes.ok) {
      console.error("[check-razorpay-order] Razorpay API error:", rpRes.status);
      return json({ paid: false, error: "Could not check order status" }, 200);
    }

    const data = await rpRes.json();
    const payments = data.items || [];

    // Find a captured/authorized payment
    const successPayment = payments.find(
      (p: any) => p.status === "captured" || p.status === "authorized"
    );

    if (successPayment) {
      console.log(`[check-razorpay-order] ✅ Found payment ${successPayment.id} for order ${order_id}`);
      return json({
        paid: true,
        razorpay_payment_id: successPayment.id,
        razorpay_order_id: order_id,
        amount: successPayment.amount,
        status: successPayment.status,
      });
    }

    console.log(`[check-razorpay-order] No successful payment found for order ${order_id}`);
    return json({ paid: false });
  } catch (err: any) {
    console.error("[check-razorpay-order] Error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
