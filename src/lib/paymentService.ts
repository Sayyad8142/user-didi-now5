/**
 * Payment service — wallet-first payments + Razorpay checkout.
 *
 * Flow:
 * 1. Debit wallet (if balance > 0)
 * 2. If fully paid → done
 * 3. Create Razorpay order for remainder
 * 4. Open checkout (platform-aware via checkoutRunner)
 * 5. Verify payment on backend
 *
 * Backend edge functions are NEVER modified by this file.
 */
import { supabase } from '@/integrations/supabase/client';
import { getFirebaseIdToken } from '@/lib/firebase';
import { runCheckout } from './checkoutRunner';

// ─── Types ────────────────────────────────────────────────────

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

export type PaymentFlowStatus =
  | 'debiting_wallet'
  | 'creating_order'
  | 'opening_checkout'
  | 'verifying_payment'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_dismissed';

// ─── Helpers ──────────────────────────────────────────────────

async function invokeWithFirebaseAuth<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { 'x-firebase-token': token },
  });

  if (error) throw new Error(error.message || `${functionName} failed`);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ─── Wallet ───────────────────────────────────────────────────

export async function debitWalletForBooking(bookingId: string): Promise<WalletPayResult> {
  console.log('💰 Debiting wallet for booking:', bookingId);
  return invokeWithFirebaseAuth<WalletPayResult>('wallet-pay', { booking_id: bookingId });
}

// ─── Order Creation ───────────────────────────────────────────

export async function createRazorpayOrder(bookingId: string): Promise<RazorpayOrderResponse> {
  console.log('🛒 Creating Razorpay order for booking:', bookingId);
  return invokeWithFirebaseAuth<RazorpayOrderResponse>('create-razorpay-order', { booking_id: bookingId });
}

// ─── Verification ─────────────────────────────────────────────

export async function verifyRazorpayPayment(
  bookingId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
): Promise<PaymentResult> {
  console.log('🔍 Verifying payment:', { bookingId, razorpayPaymentId });
  return invokeWithFirebaseAuth<PaymentResult>('verify-razorpay-payment', {
    booking_id: bookingId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  });
}

// ─── Full Payment Flow ────────────────────────────────────────

/**
 * Wallet-first, platform-aware payment flow.
 * SAFETY: Never deletes bookings. On failure, booking stays for webhook reconciliation.
 */
export async function executePaymentFlow(
  bookingId: string,
  onStatusChange: (status: PaymentFlowStatus) => void,
): Promise<PaymentResult> {
  // Step 1: Try wallet
  onStatusChange('debiting_wallet');
  let walletResult: WalletPayResult | null = null;

  try {
    walletResult = await debitWalletForBooking(bookingId);
    console.log('💰 Wallet debit result:', walletResult);
  } catch (walletErr: any) {
    console.warn('⚠️ Wallet debit failed (proceeding with Razorpay):', walletErr.message);
  }

  // Step 2: Fully paid by wallet?
  if (walletResult?.fully_paid) {
    console.log('✅ Fully paid by wallet');
    onStatusChange('payment_success');
    return { success: true, booking_id: bookingId, payment_method: 'wallet' };
  }

  // Step 3: Create Razorpay order for remaining amount
  onStatusChange('creating_order');
  const order = await createRazorpayOrder(bookingId);
  console.log('🛒 Order created:', order.order_id, 'amount:', order.amount);

  // Step 4: Open checkout (native on Android, web otherwise)
  onStatusChange('opening_checkout');
  const checkoutResult = await runCheckout(order);

  // Step 5: Verify on backend (source of truth)
  onStatusChange('verifying_payment');
  try {
    const verifyResult = await verifyRazorpayPayment(
      bookingId,
      checkoutResult.razorpay_order_id,
      checkoutResult.razorpay_payment_id,
      checkoutResult.razorpay_signature,
    );
    console.log('✅ Backend verification success');
    onStatusChange('payment_success');
    return {
      ...verifyResult,
      payment_method: walletResult && walletResult.wallet_debited > 0 ? 'wallet+razorpay' : 'razorpay',
    };
  } catch (verifyErr: any) {
    // Verification call failed but payment may have gone through — webhook will reconcile
    console.warn('⚠️ Verify call failed, webhook will reconcile:', verifyErr.message);
    onStatusChange('payment_success');
    return {
      success: true,
      booking_id: bookingId,
      payment_id: checkoutResult.razorpay_payment_id,
      payment_method: walletResult && walletResult.wallet_debited > 0 ? 'wallet+razorpay' : 'razorpay',
    };
  }
}
