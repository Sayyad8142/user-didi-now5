/**
 * Payment service for Razorpay integration + Wallet-first payments
 * Handles order creation, checkout, and verification
 * 
 * Wallet-first flow:
 * 1. Check wallet balance
 * 2. If wallet >= booking amount → full wallet payment (no Razorpay)
 * 3. If wallet > 0 but < booking amount → debit wallet, pay remainder via Razorpay
 * 4. If wallet = 0 → normal Razorpay flow
 */
import { supabase } from '@/integrations/supabase/client';
import { getFirebaseIdToken } from '@/lib/firebase';

export interface RazorpayOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  booking_id: string;
  prefill: {
    name: string;
    contact: string;
  };
}

export interface PaymentResult {
  success: boolean;
  booking_id: string;
  payment_id?: string;
  payment_method?: string;
  error?: string;
}

export interface WalletPayResult {
  wallet_debited: number;
  remaining_amount: number;
  fully_paid: boolean;
  wallet_balance: number;
  payment_method?: string;
  already_debited?: boolean;
  already_paid?: boolean;
}

async function invokeWithFirebaseAuth<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      'x-firebase-token': token,
    },
  });

  if (error) throw new Error(error.message || `${functionName} failed`);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/**
 * Step 0: Attempt wallet debit for booking
 * Returns how much was debited and remaining amount
 */
export async function debitWalletForBooking(bookingId: string): Promise<WalletPayResult> {
  return invokeWithFirebaseAuth<WalletPayResult>('wallet-pay', {
    booking_id: bookingId,
  });
}

/**
 * Step 1: Create a Razorpay order via backend
 */
export async function createRazorpayOrder(bookingId: string): Promise<RazorpayOrderResponse> {
  return invokeWithFirebaseAuth<RazorpayOrderResponse>('create-razorpay-order', {
    booking_id: bookingId,
  });
}

/**
 * Step 2: Open Razorpay checkout and handle payment
 */
export function openRazorpayCheckout(
  order: RazorpayOrderResponse,
  onSuccess: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void,
  onFailure: (error: any) => void,
  onDismiss: () => void
): void {
  const options = {
    key: order.key_id,
    amount: order.amount,
    currency: order.currency,
    name: 'Didi Now',
    description: `Booking #${order.booking_id.slice(0, 8)}`,
    order_id: order.order_id,
    prefill: {
      name: order.prefill.name,
      contact: order.prefill.contact,
    },
    theme: {
      color: '#ff007a',
    },
    modal: {
      ondismiss: onDismiss,
    },
    handler: (response: any) => {
      onSuccess({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
  };

  try {
    const rzp = new (window as any).Razorpay(options);
    rzp.on('payment.failed', (response: any) => {
      onFailure(response.error);
    });
    rzp.open();
  } catch (err) {
    onFailure(err);
  }
}

/**
 * Step 3: Verify payment on backend
 */
export async function verifyRazorpayPayment(
  bookingId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): Promise<PaymentResult> {
  return invokeWithFirebaseAuth<PaymentResult>('verify-razorpay-payment', {
    booking_id: bookingId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  });
}

/**
 * Full wallet-first payment flow:
 * 1. Try wallet debit first
 * 2. If fully paid → done
 * 3. If partial/no wallet → create Razorpay order → checkout → verify
 * 
 * SAFETY: Never deletes bookings. On failure, booking stays for webhook reconciliation.
 */
export async function executePaymentFlow(
  bookingId: string,
  onStatusChange: (status: PaymentFlowStatus) => void
): Promise<PaymentResult> {
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1: Try wallet payment first
      onStatusChange('debiting_wallet');
      let walletResult: WalletPayResult | null = null;
      
      try {
        walletResult = await debitWalletForBooking(bookingId);
        console.log('💰 Wallet debit result:', walletResult);
      } catch (walletErr: any) {
        console.warn('⚠️ Wallet debit failed (proceeding with Razorpay):', walletErr.message);
        // If wallet fails, proceed with full Razorpay
      }

      // Step 2: Check if fully paid by wallet
      if (walletResult?.fully_paid) {
        onStatusChange('payment_success');
        resolve({
          success: true,
          booking_id: bookingId,
          payment_method: 'wallet',
        });
        return;
      }

      // Step 3: Need Razorpay for remaining amount (or full amount)
      onStatusChange('creating_order');
      const order = await createRazorpayOrder(bookingId);

      onStatusChange('opening_checkout');
      openRazorpayCheckout(
        order,
        async (response) => {
          try {
            onStatusChange('verifying_payment');
            const result = await verifyRazorpayPayment(
              bookingId,
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
            onStatusChange('payment_success');
            resolve({
              ...result,
              payment_method: walletResult && walletResult.wallet_debited > 0 ? 'wallet+razorpay' : 'razorpay',
            });
          } catch (err: any) {
            // Verification failed but payment may have gone through
            console.warn('⚠️ Payment verify call failed, webhook will reconcile:', err.message);
            onStatusChange('payment_success');
            resolve({
              success: true,
              booking_id: bookingId,
              payment_id: response.razorpay_payment_id,
              payment_method: walletResult && walletResult.wallet_debited > 0 ? 'wallet+razorpay' : 'razorpay',
            });
          }
        },
        (error) => {
          onStatusChange('payment_failed');
          reject(new Error(error?.description || error?.reason || 'Payment failed'));
        },
        () => {
          onStatusChange('payment_dismissed');
          reject(new Error('Payment cancelled by user'));
        }
      );
    } catch (err: any) {
      onStatusChange('payment_failed');
      reject(err);
    }
  });
}

export type PaymentFlowStatus =
  | 'debiting_wallet'
  | 'creating_order'
  | 'opening_checkout'
  | 'verifying_payment'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_dismissed';
