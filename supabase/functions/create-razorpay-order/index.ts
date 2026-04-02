/**
 * create-razorpay-order — Creates a Razorpay order.
 *
 * Supports TWO modes:
 *   1. Legacy mode:        { booking_id }          — looks up existing booking (for retries)
 *   2. Payment-first mode: { amount, service_type } — creates order without a booking row
 *
 * Payment-first mode is used when no booking exists yet (pay_now flow).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken, extractToken, corsHeaders } from "../_shared/firebaseAuth.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 0. Validate env vars
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.error("[create-razorpay-order] ❌ Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET");
      return json({ error: "Payment server not configured", step: "env_check" }, 500);
    }

    // 1. Authenticate user
    const idToken = extractToken(req);
    if (!idToken) {
      console.error("[create-razorpay-order] ❌ No auth token in request");
      return json({ error: "Not authenticated", step: "auth" }, 401);
    }

    let firebaseUser;
    try {
      firebaseUser = await verifyFirebaseToken(idToken);
    } catch (authErr: any) {
      console.error("[create-razorpay-order] ❌ Firebase token verification failed:", authErr.message);
      return json({ error: "Authentication expired, please login again", step: "firebase_verify" }, 401);
    }

    console.log(`[create-razorpay-order] 🔑 firebase_uid=${firebaseUser.uid}`);

    // 2. Parse request
    const body = await req.json();
    const { booking_id, amount, service_type } = body;
    console.log(`[create-razorpay-order] 📦 Request: booking_id=${booking_id || 'none'}, amount=${amount}, service_type=${service_type}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Map firebase_uid to profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("firebase_uid", firebaseUser.uid)
      .single();

    if (profileErr || !profile) {
      console.error("[create-razorpay-order] ❌ Profile lookup failed:", profileErr?.message, "firebase_uid:", firebaseUser.uid);
      return json({ error: "Profile not found", step: "profile_lookup" }, 404);
    }

    console.log(`[create-razorpay-order] 👤 profile_id=${profile.id}`);

    // ────────────────────────────────────────────────────────────
    // MODE A: Payment-first (no booking exists yet)
    // ────────────────────────────────────────────────────────────
    if (!booking_id && amount && service_type) {
      const amountInPaise = Math.round(amount * 100);
      if (amountInPaise <= 0) {
        return json({ error: "Invalid amount" }, 400);
      }

      const receipt = `pf_${profile.id.slice(0, 8)}_${Date.now()}`;
      const prefillName = /^\+?\d{7,15}$/.test((profile.full_name || "").trim())
        ? "User " + (profile.phone || "").slice(-4)
        : profile.full_name || "";

      // Create Razorpay order
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
          receipt,
          notes: {
            service_type,
            user_id: profile.id,
            mode: "payment_first",
          },
        }),
      });

      if (!rpRes.ok) {
        const errText = await rpRes.text();
        console.error("[create-razorpay-order] ❌ Razorpay API failed:", rpRes.status, errText);
        return json({ error: "Unable to create Razorpay order", step: "razorpay_api", razorpay_status: rpRes.status }, 502);
      }

      const rpOrder = await rpRes.json();

      console.log(`[create-razorpay-order] ✅ Payment-first order: ${rpOrder.id}, amount: ₹${amount}`);

      return json({
        order_id: rpOrder.id,
        amount: amountInPaise,
        currency: "INR",
        key_id: RAZORPAY_KEY_ID,
        booking_id: receipt, // Use receipt as placeholder (no real booking yet)
        prefill: {
          name: prefillName,
          contact: profile.phone || "",
        },
      });
    }

    // ────────────────────────────────────────────────────────────
    // MODE B: Legacy mode (existing booking_id) — for retries
    // ────────────────────────────────────────────────────────────
    if (!booking_id) {
      return json({ error: "booking_id or (amount + service_type) required" }, 400);
    }

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, user_id, price_inr, payment_status, razorpay_order_id, cust_name, cust_phone, service_type, wallet_used_amount, razorpay_paid_amount")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }

    if (booking.user_id !== profile.id) {
      return json({ error: "Booking does not belong to user" }, 403);
    }

    if (booking.payment_status === "paid") {
      return json({ error: "Booking already paid" }, 409);
    }

    // If order already exists and not yet paid, return existing order
    if (booking.razorpay_order_id && booking.payment_status === "order_created") {
      const existingAmount = (booking.razorpay_paid_amount ?? booking.price_inr!) * 100;
      return json({
        order_id: booking.razorpay_order_id,
        amount: existingAmount,
        currency: "INR",
        key_id: RAZORPAY_KEY_ID,
        booking_id: booking.id,
        prefill: {
          name: booking.cust_name,
          contact: booking.cust_phone,
        },
      });
    }

    const chargeAmount = booking.razorpay_paid_amount ?? booking.price_inr!;
    const amountInPaise = chargeAmount * 100;
    if (amountInPaise <= 0) {
      return json({ error: "Invalid booking amount" }, 400);
    }

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
      console.error("[create-razorpay-order] ❌ Razorpay API failed (legacy):", rpRes.status, errText);
      return json({ error: "Unable to create Razorpay order", step: "razorpay_api", razorpay_status: rpRes.status }, 502);
    }

    const rpOrder = await rpRes.json();

    await supabase
      .from("bookings")
      .update({
        razorpay_order_id: rpOrder.id,
        payment_status: "order_created",
        payment_amount_inr: chargeAmount,
      })
      .eq("id", booking.id);

    return json({
      order_id: rpOrder.id,
      amount: amountInPaise,
      currency: "INR",
      key_id: RAZORPAY_KEY_ID,
      booking_id: booking.id,
      prefill: {
        name: booking.cust_name,
        contact: booking.cust_phone,
      },
    });

  } catch (err: any) {
    console.error("[create-razorpay-order] ❌ Unhandled error:", err);
    return json({ error: err.message || "Internal error", step: "unhandled" }, 500);
  }
});
