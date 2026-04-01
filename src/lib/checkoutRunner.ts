/**
 * Platform-aware checkout runner.
 * - Android native → Razorpay native SDK via Capacitor plugin
 * - Web / iOS     → Razorpay checkout.js (existing)
 */
import { getAppPlatform } from '@/utils/platform';
import type { RazorpayOrderResponse } from './paymentService';

export interface CheckoutSuccessPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Opens the correct checkout experience based on current platform.
 * Returns a promise that resolves on success or rejects on failure/cancel.
 *
 * Cancel always rejects with message "Payment cancelled by user" to match
 * the existing downstream handling in booking screens.
 */
export async function runCheckout(order: RazorpayOrderResponse): Promise<CheckoutSuccessPayload> {
  const platform = getAppPlatform();
  console.log(`💳 runCheckout — platform=${platform}, order=${order.order_id}`);

  if (platform === 'android') {
    return runNativeAndroidCheckout(order);
  }

  // Web + iOS fallback → existing checkout.js
  return runWebCheckout(order);
}

// ─── Android native SDK ───────────────────────────────────────

async function runNativeAndroidCheckout(order: RazorpayOrderResponse): Promise<CheckoutSuccessPayload> {
  console.log('📱 Opening native Razorpay checkout (Android)');

  // Dynamic import so the Capacitor plugin module is only loaded on native
  const { default: RazorpayNative } = await import('./razorpayNative');

  try {
    const result = await RazorpayNative.openCheckout({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: 'Didi Now',
      description: `Booking #${order.booking_id.slice(0, 8)}`,
      prefill_contact: order.prefill?.contact || '',
      prefill_name: order.prefill?.name || '',
      theme_color: '#ec4899',
    });

    console.log('✅ Native checkout success:', result.razorpay_payment_id);
    return {
      razorpay_order_id: result.razorpay_order_id,
      razorpay_payment_id: result.razorpay_payment_id,
      razorpay_signature: result.razorpay_signature,
    };
  } catch (err: any) {
    // The native plugin rejects with "Payment cancelled by user" when code=2
    console.warn('⚠️ Native checkout error:', err?.message);
    throw err;
  }
}

// ─── Web checkout.js ──────────────────────────────────────────

function runWebCheckout(order: RazorpayOrderResponse): Promise<CheckoutSuccessPayload> {
  console.log('🌐 Opening web Razorpay checkout');

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
          console.log('🚪 Web checkout dismissed by user');
          reject(new Error('Payment cancelled by user'));
        },
      },
      handler: (response: any) => {
        console.log('✅ Web checkout success:', response.razorpay_payment_id);
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
        console.warn('❌ Web checkout payment failed:', response.error?.description);
        reject(new Error(response.error?.description || response.error?.reason || 'Payment failed'));
      });
      rzp.open();
    } catch (err) {
      reject(err);
    }
  });
}
