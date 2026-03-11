import { supabase } from "@/integrations/supabase/client";
import { getFirebaseIdToken } from "@/lib/firebase";
import { shouldUseNativeRazorpay, RazorpayNative } from "@/lib/razorpayNative";

declare global {
  interface Window {
    Razorpay: any;
  }
}

let scriptLoaded = false;

/** Load the Razorpay checkout.js script (web only) */
export function loadRazorpayScript(): Promise<void> {
  // On native Android we use the SDK — no script needed
  if (shouldUseNativeRazorpay()) return Promise.resolve();

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

/* ------------------------------------------------------------------ */
/*  Helper: mark intent as cancelled / failed                         */
/* ------------------------------------------------------------------ */
async function markIntentStatus(orderId: string, status: "cancelled" | "failed") {
  try {
    const tkn = await getFirebaseIdToken();
    await supabase.functions.invoke("update-payment-intent-status", {
      body: { razorpay_order_id: orderId, status },
      headers: { "x-firebase-token": tkn || "" },
    });
  } catch (e) {
    console.warn(`[Razorpay] Failed to mark intent ${status}:`, e);
  }
}

/* ------------------------------------------------------------------ */
/*  Native Android payment via Razorpay SDK                           */
/* ------------------------------------------------------------------ */
async function nativePay(orderData: any): Promise<RazorpayPaymentResult> {
  console.log("📱 [Razorpay] Using native Android SDK for UPI intent support");

  const result = await RazorpayNative.pay({
    key: orderData.key_id,
    order_id: orderData.order_id,
    amount: orderData.amount, // paise
    currency: orderData.currency || "INR",
    name: "Didi Now",
    description: "Service Booking Payment",
    prefill_email: orderData.prefill?.email || "",
    prefill_phone: orderData.prefill?.contact || orderData.prefill?.phone || "",
    prefill_name: orderData.prefill?.name || "",
    theme_color: "#6366f1",
  });

  if (result.status === "success") {
    return {
      razorpay_order_id: result.razorpay_order_id!,
      razorpay_payment_id: result.razorpay_payment_id!,
      razorpay_signature: result.razorpay_signature!,
    };
  }

  if (result.status === "cancelled") {
    throw new Error("Payment cancelled by user");
  }

  // failed
  throw new Error(result.error_description || "Payment failed");
}

/* ------------------------------------------------------------------ */
/*  Web payment via checkout.js                                       */
/* ------------------------------------------------------------------ */
function webPay(orderData: any): Promise<RazorpayPaymentResult> {
  return new Promise<RazorpayPaymentResult>((resolve, reject) => {
    const options: any = {
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
      // UPI intent config for mobile web (helps on Chrome/Safari)
      config: {
        display: {
          blocks: {
            upi_apps: {
              name: "Pay using UPI App",
              instruments: [
                { method: "upi", flows: ["intent", "collect", "qr"] },
              ],
            },
          },
          sequence: ["block.upi_apps"],
          preferences: { show_default_blocks: true },
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
}

/* ------------------------------------------------------------------ */
/*  Platform-aware payment runner                                     */
/* ------------------------------------------------------------------ */
async function platformPay(orderData: any): Promise<RazorpayPaymentResult> {
  if (shouldUseNativeRazorpay()) {
    return nativePay(orderData);
  }
  return webPay(orderData);
}

/* ================================================================== */
/*  PUBLIC API                                                        */
/* ================================================================== */

/**
 * Intent-based Razorpay flow (for instant bookings):
 * 1. Create order via edge function (no booking row needed)
 * 2. Open Razorpay checkout (native SDK on Android, checkout.js on web)
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

  // 2. Open Razorpay (native or web)
  let paymentResult: RazorpayPaymentResult;
  try {
    paymentResult = await platformPay(orderData);
  } catch (err: any) {
    // Mark intent cancelled/failed
    const isCancelled = err?.message?.toLowerCase().includes("cancelled");
    await markIntentStatus(orderData.order_id, isCancelled ? "cancelled" : "failed");
    throw err;
  }

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
 * 2. Open Razorpay checkout (native SDK on Android, checkout.js on web)
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

  // 2. Open Razorpay (native or web)
  const paymentResult = await platformPay(orderData);

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
