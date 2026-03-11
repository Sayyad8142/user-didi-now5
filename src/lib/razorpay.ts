import { supabase } from "@/integrations/supabase/client";
import { getFirebaseIdToken } from "@/lib/firebase";

declare global {
  interface Window {
    Razorpay: any;
  }
}

let scriptLoaded = false;

/** Load the Razorpay checkout.js script */
export function loadRazorpayScript(): Promise<void> {
  if (scriptLoaded && window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (document.getElementById("razorpay-script")) {
      scriptLoaded = true;
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.id = "razorpay-script";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => {
      scriptLoaded = true;
      console.log("✅ [Razorpay] checkout.js loaded");
      resolve();
    };
    s.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
    document.head.appendChild(s);
  });
}

interface RazorpayPaymentResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Intent-based Razorpay flow (for instant bookings):
 * 1. Create order via edge function (no booking row needed)
 * 2. Open Razorpay checkout
 * 3. Verify payment — booking is created server-side on success
 * Returns the new booking ID.
 */
export async function initiateIntentPayment(
  bookingData: Record<string, unknown>,
  amount: number
): Promise<string> {
  console.log("🚀 [Razorpay] Starting intent payment flow, amount:", amount);

  await loadRazorpayScript();

  const firebaseToken = await getFirebaseIdToken();
  if (!firebaseToken) {
    throw new Error("Not authenticated - no Firebase token");
  }

  // 1. Create Razorpay order with booking data
  console.log("📦 [Razorpay] Creating intent-based order...");
  const { data: orderData, error: orderError } = await supabase.functions.invoke(
    "create-razorpay-order",
    {
      body: { booking_data: bookingData, amount },
      headers: { "x-firebase-token": firebaseToken },
    }
  );

  if (orderError || !orderData?.order_id) {
    console.error("❌ [Razorpay] Intent order creation failed:", orderError, orderData);
    throw new Error(orderData?.error || orderError?.message || "Failed to create payment order");
  }

  console.log("✅ [Razorpay] Intent order created:", orderData.order_id);

  // 2. Open Razorpay Checkout
  const paymentResult = await new Promise<RazorpayPaymentResult>((resolve, reject) => {
    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      name: "Didi Now",
      description: "Service Booking Payment",
      order_id: orderData.order_id,
      prefill: orderData.prefill || {},
      theme: { color: "#6366f1" },
      handler: (response: RazorpayPaymentResult) => {
        console.log("✅ [Razorpay] Payment completed by user");
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          console.log("⚠️ [Razorpay] Modal dismissed by user");
          reject(new Error("Payment cancelled by user"));
        },
      },
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        console.error("❌ [Razorpay] payment.failed:", response.error);
        reject(new Error(response.error?.description || "Payment failed"));
      });
      rzp.open();
      console.log("✅ [Razorpay] Checkout modal opened");
    } catch (err) {
      console.error("❌ [Razorpay] Failed to open checkout:", err);
      reject(err);
    }
  });

  // 3. Verify payment — this also creates the booking server-side
  console.log("🔍 [Razorpay] Verifying intent payment...");
  const freshToken = await getFirebaseIdToken();
  const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
    "verify-razorpay-payment",
    {
      body: {
        razorpay_order_id: paymentResult.razorpay_order_id,
        razorpay_payment_id: paymentResult.razorpay_payment_id,
        razorpay_signature: paymentResult.razorpay_signature,
      },
      headers: { "x-firebase-token": freshToken || firebaseToken },
    }
  );

  if (verifyError || !verifyData?.success) {
    console.error("❌ [Razorpay] Intent verification failed:", verifyError, verifyData);
    throw new Error(verifyData?.error || verifyError?.message || "Payment verification failed");
  }

  console.log("✅ [Razorpay] Intent payment verified, booking created:", verifyData.booking_id);
  return verifyData.booking_id;
}

/**
 * Legacy Razorpay flow (for scheduled bookings with existing booking row):
 * 1. Create order via edge function
 * 2. Open Razorpay checkout
 * 3. Verify payment via edge function
 */
export async function initiateRazorpayPayment(bookingId: string): Promise<string> {
  console.log("🚀 [Razorpay] Starting booking-based payment flow for:", bookingId);

  await loadRazorpayScript();

  const firebaseToken = await getFirebaseIdToken();
  if (!firebaseToken) {
    throw new Error("Not authenticated - no Firebase token");
  }

  // 1. Create Razorpay order
  const { data: orderData, error: orderError } = await supabase.functions.invoke(
    "create-razorpay-order",
    {
      body: { booking_id: bookingId },
      headers: { "x-firebase-token": firebaseToken },
    }
  );

  if (orderError || !orderData?.order_id) {
    throw new Error(orderData?.error || orderError?.message || "Failed to create payment order");
  }

  // 2. Open Razorpay Checkout
  const paymentResult = await new Promise<RazorpayPaymentResult>((resolve, reject) => {
    const options = {
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      name: "Didi Now",
      description: "Service Booking Payment",
      order_id: orderData.order_id,
      prefill: orderData.prefill || {},
      theme: { color: "#6366f1" },
      handler: (response: RazorpayPaymentResult) => {
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          reject(new Error("Payment cancelled by user"));
        },
      },
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        reject(new Error(response.error?.description || "Payment failed"));
      });
      rzp.open();
    } catch (err) {
      reject(err);
    }
  });

  // 3. Verify payment
  const freshToken = await getFirebaseIdToken();
  const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
    "verify-razorpay-payment",
    {
      body: {
        booking_id: bookingId,
        razorpay_order_id: paymentResult.razorpay_order_id,
        razorpay_payment_id: paymentResult.razorpay_payment_id,
        razorpay_signature: paymentResult.razorpay_signature,
      },
      headers: { "x-firebase-token": freshToken || firebaseToken },
    }
  );

  if (verifyError || !verifyData?.success) {
    throw new Error(verifyData?.error || verifyError?.message || "Payment verification failed");
  }

  return bookingId;
}
