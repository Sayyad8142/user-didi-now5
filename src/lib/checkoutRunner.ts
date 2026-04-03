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

export interface CheckoutOrderPollResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
}

export interface CheckoutResult {
  status: 'success' | 'dismissed' | 'failed';
  payload?: CheckoutSuccessPayload;
  error?: string;
  source?: 'handler' | 'order_poll';
}

export interface CheckoutRunnerOptions {
  pollForPayment?: () => Promise<CheckoutOrderPollResult | null>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

/**
 * Opens Razorpay checkout.js overlay.
 * Resolves with status: 'success' | 'dismissed' | 'failed'.
 * NEVER rejects — caller decides how to handle each status.
 */
export function runCheckout(
  order: RazorpayOrderResponse,
  runnerOptions: CheckoutRunnerOptions = {},
): Promise<CheckoutResult> {
  console.log(`💳 runCheckout — order=${order.order_id}`);

  return new Promise((resolve) => {
    let settled = false;
    let rzp: any = null;
    let pollIntervalId: number | null = null;
    let pollAttemptCount = 0;
    let pollInFlight = false;

    const cleanup = () => {
      if (pollIntervalId !== null) {
        window.clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };

    const settle = (result: CheckoutResult) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (result.status === 'success' && result.source === 'order_poll') {
        try {
          rzp?.close?.();
        } catch (closeErr) {
          console.warn('⚠️ Failed to close checkout after order polling success:', closeErr);
        }
      }

      resolve(result);
    };

    const pollForExternalPayment = async (reason: string) => {
      if (settled || pollInFlight || !runnerOptions.pollForPayment) return;

      pollInFlight = true;
      try {
        const payment = await runnerOptions.pollForPayment();
        if (!payment?.razorpay_payment_id) return;

        console.log(`✅ Checkout payment detected via ${reason}:`, payment.razorpay_payment_id);
        settle({
          status: 'success',
          source: 'order_poll',
          payload: {
            razorpay_order_id: payment.razorpay_order_id,
            razorpay_payment_id: payment.razorpay_payment_id,
            razorpay_signature: '',
          },
        });
      } catch (pollErr: any) {
        console.warn(`⚠️ Checkout payment poll failed (${reason}):`, pollErr?.message || pollErr);
      } finally {
        pollInFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void pollForExternalPayment('visibilitychange');
      }
    };

    const handleWindowFocus = () => {
      void pollForExternalPayment('focus');
    };

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
          if (settled) return;
          console.log('🚪 Checkout dismissed by user (may have paid via QR)');
          settle({ status: 'dismissed' });
        },
      },
      handler: (response: any) => {
        if (settled) return;
        console.log('✅ Checkout success:', response.razorpay_payment_id);
        settle({
          status: 'success',
          source: 'handler',
          payload: {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
        });
      },
    };

    try {
      rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        if (settled) return;
        console.warn('❌ Checkout payment failed:', response.error?.description);
        settle({
          status: 'failed',
          source: 'handler',
          error: response.error?.description || response.error?.reason || 'Payment failed',
        });
      });

      if (runnerOptions.pollForPayment) {
        const pollIntervalMs = runnerOptions.pollIntervalMs ?? 4000;
        const maxPollAttempts = runnerOptions.maxPollAttempts ?? 45;

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);

        pollIntervalId = window.setInterval(() => {
          pollAttemptCount += 1;
          if (pollAttemptCount > maxPollAttempts) {
            if (pollIntervalId !== null) {
              window.clearInterval(pollIntervalId);
              pollIntervalId = null;
            }
            return;
          }

          void pollForExternalPayment(`interval-${pollAttemptCount}`);
        }, pollIntervalMs);
      }

      rzp.open();
    } catch (err: any) {
      settle({ status: 'failed', error: err.message || 'Checkout failed to open' });
    }
  });
}
