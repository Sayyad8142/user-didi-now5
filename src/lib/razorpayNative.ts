/**
 * Bridge to the native Razorpay Android SDK via Capacitor plugin.
 * Falls back to checkout.js on web/iOS.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

interface RazorpayNativePlugin {
  pay(options: {
    key: string;
    order_id: string;
    amount: number;
    currency?: string;
    name?: string;
    description?: string;
    prefill_email?: string;
    prefill_phone?: string;
    prefill_name?: string;
    theme_color?: string;
  }): Promise<{
    status: "success" | "cancelled" | "failed";
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
    error_code?: number;
    error_description?: string;
  }>;
  preload(): Promise<void>;
}

const RazorpayNative = registerPlugin<RazorpayNativePlugin>("RazorpayNative");

/** Returns true when we should use the native Razorpay SDK (Android app) */
export function shouldUseNativeRazorpay(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export { RazorpayNative };
