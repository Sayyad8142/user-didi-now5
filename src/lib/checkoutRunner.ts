/**
 * Unified checkout runner — always uses Razorpay checkout.js (works in
 * browser and Capacitor WebView on Android / iOS).
 */
import type { RazorpayOrderResponse } from './paymentService';

export interface CheckoutSuccessPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface CheckoutResult {
  status: 'success' | 'dismissed' | 'failed';
  payload?: CheckoutSuccessPayload;
  error?: string;
}

/**
 * Opens Razorpay checkout.js overlay.
 * Resolves with status: 'success' | 'dismissed' | 'failed'.
 * NEVER rejects — caller decides how to handle each status.
 */
export function runCheckout(order: RazorpayOrderResponse): Promise<CheckoutResult> {
  console.log(`💳 runCheckout — order=${order.order_id}`);

  return new Promise((resolve) => {
    const options: Record<string, any> = {
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Didi Now',
      description: `Booking #${order.booking_id.slice(0, 8)}`,
      order_id: order.order_id,
      prefill: {
        name: order.prefill?.name || '',
        contact: order.prefill?.contact || '',
      },
      theme: { color: '#ec4899' },
      // Enable UPI intent flow inside Capacitor / WebView so Razorpay
      // shows installed UPI apps (GPay, PhonePe, Paytm) instead of
      // only the manual UPI-ID entry screen.
      webview_intent: true,
      modal: {
        // Ask user to confirm before closing — prevents accidental
        // dismissal after QR scan payment.
        confirm_close: true,
        ondismiss: () => {
          console.log('🚪 Checkout dismissed by user (may have paid via QR)');
          resolve({ status: 'dismissed' });
        },
      },
      handler: (response: any) => {
        console.log('✅ Checkout success:', response.razorpay_payment_id);
        resolve({
          status: 'success',
          payload: {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
        });
      },
    };

    try {
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        console.warn('❌ Checkout payment failed:', response.error?.description);
        resolve({
          status: 'failed',
          error: response.error?.description || response.error?.reason || 'Payment failed',
        });
      });
      rzp.open();
    } catch (err: any) {
      resolve({ status: 'failed', error: err.message || 'Checkout failed to open' });
    }
  });
}
