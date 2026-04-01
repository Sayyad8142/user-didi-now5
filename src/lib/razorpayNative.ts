/**
 * Capacitor bridge to the native Razorpay Android SDK plugin.
 * Only callable on Android native builds.
 */
import { registerPlugin } from '@capacitor/core';

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;       // in paise
  currency: string;
  order_id: string;
  name?: string;
  description?: string;
  prefill_contact?: string;
  prefill_name?: string;
  theme_color?: string;
}

export interface RazorpaySuccessResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayNativePlugin {
  openCheckout(options: RazorpayCheckoutOptions): Promise<RazorpaySuccessResult>;
}

const RazorpayNative = registerPlugin<RazorpayNativePlugin>('RazorpayNative');

export default RazorpayNative;
