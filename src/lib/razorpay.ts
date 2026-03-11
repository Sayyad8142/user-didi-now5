import { supabase } from "@/integrations/supabase/client";

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
 * Full Razorpay checkout flow:
 * 1. Create order via edge function
 * 2. Open Razorpay checkout
 * 3. Verify payment via edge function
 * Returns the booking_id on success, throws on failure.
 */
export async function initiateRazorpayPayment(bookingId: string): Promise<string> {
  await loadRazorpayScript();

  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("Not authenticated");

  // 1. Create Razorpay order
  const { data: orderData, error: orderError } = await supabase.functions.invoke(
    "create-razorpay-order",
    { body: { booking_id: bookingId } }
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

    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", (response: any) => {
      console.error("Razorpay payment failed:", response.error);
      reject(new Error(response.error?.description || "Payment failed"));
    });
    rzp.open();
  });

  // 3. Verify payment
  const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
    "verify-razorpay-payment",
    {
      body: {
        booking_id: bookingId,
        razorpay_order_id: paymentResult.razorpay_order_id,
        razorpay_payment_id: paymentResult.razorpay_payment_id,
        razorpay_signature: paymentResult.razorpay_signature,
      },
    }
  );

  if (verifyError || !verifyData?.success) {
    throw new Error(verifyData?.error || verifyError?.message || "Payment verification failed");
  }

  return bookingId;
}
