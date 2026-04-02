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

/**
 * Opens Razorpay checkout.js overlay.
 * Resolves on success, rejects on failure / user cancel.
 */
export function runCheckout(order: RazorpayOrderResponse): Promise<CheckoutSuccessPayload> {
  console.log(`💳 runCheckout — order=${order.order_id}`);

  return new Promise((resolve, reject) => {
    const options = {
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
      modal: {
        ondismiss: () => {
          console.log('🚪 Checkout dismissed by user');
          reject(new Error('Payment cancelled by user'));
        },
      },
      handler: (response: any) => {
        console.log('✅ Checkout success:', response.razorpay_payment_id);
        resolve({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
    };

    try {
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        console.warn('❌ Checkout payment failed:', response.error?.description);
        reject(new Error(response.error?.description || response.error?.reason || 'Payment failed'));
      });
      rzp.open();
    } catch (err) {
      reject(err);
    }
  });
}