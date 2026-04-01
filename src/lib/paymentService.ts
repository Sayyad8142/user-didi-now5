/**
 * Payment service — wallet-first payments + Razorpay checkout.
 *
 * Flow:
 * 1. Debit wallet (if balance > 0)
 * 2. If fully paid → done
 * 3. Create Razorpay order for remainder
 * 4. Open checkout (platform-aware via checkoutRunner)
 * 5. Verify payment on backend (with retry)
 *
 * SAFETY:
 * - Never deletes bookings
 * - On cancel → booking stays pending for retry
 * - On verification failure → webhook reconciles
 * - Backend is always source of truth
 */
import { supabase } from '@/integrations/supabase/client';
import { getFirebaseIdToken } from '@/lib/firebase';
import { runCheckout } from './checkoutRunner';
import {
  trackPaymentEvent,
  savePreferredMethod,
  saveLastFailure,
  clearLastFailure,
  logPaymentSummary,
} from './paymentAnalytics';

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
  | 'payment_cancelled'
  | 'verification_pending';

/** Error types for downstream handling */
export type PaymentErrorType = 'user_cancelled' | 'payment_failed' | 'network_error' | 'verification_failed';

export class PaymentError extends Error {
  type: PaymentErrorType;
  constructor(message: string, type: PaymentErrorType) {
    super(message);
    this.name = 'PaymentError';
    this.type = type;
  }
}

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

function isNetworkError(err: any): boolean {
  const msg = err?.message || '';
  return msg.includes('Load failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network');
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// ─── Verification (with retry) ────────────────────────────────

async function verifyWithRetry(
  bookingId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  maxAttempts = 3,
): Promise<PaymentResult> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🔍 Verify attempt ${attempt}/${maxAttempts}:`, razorpayPaymentId);
      const result = await invokeWithFirebaseAuth<PaymentResult>('verify-razorpay-payment', {
        booking_id: bookingId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
      });
      console.log('✅ Backend verification success on attempt', attempt);
      return result;
    } catch (err: any) {
      lastErr = err;
      console.warn(`⚠️ Verify attempt ${attempt} failed:`, err.message);
      if (attempt < maxAttempts) await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

// ─── Full Payment Flow ────────────────────────────────────────

/**
 * Wallet-first, platform-aware payment flow.
 *
 * SAFETY:
 * - NEVER deletes bookings
 * - On cancel → throws PaymentError('user_cancelled') — caller keeps booking pending
 * - On failure → throws PaymentError('payment_failed') — caller keeps booking for retry
 * - On verify failure after 3 retries → throws PaymentError('verification_pending') — webhook reconciles
 */
export async function executePaymentFlow(
  bookingId: string,
  onStatusChange: (status: PaymentFlowStatus) => void,
): Promise<PaymentResult> {
  trackPaymentEvent('payment_started', { booking_id: bookingId });

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
    trackPaymentEvent('payment_success', {
      booking_id: bookingId,
      payment_method: 'wallet',
      wallet_used_amount: walletResult.wallet_debited,
    });
    savePreferredMethod('wallet');
    clearLastFailure();
    logPaymentSummary();
    return { success: true, booking_id: bookingId, payment_method: 'wallet' };
  }

  // Step 3: Create Razorpay order for remaining amount
  onStatusChange('creating_order');
  const order = await createRazorpayOrder(bookingId);
  console.log('🛒 Order created:', order.order_id, 'amount:', order.amount);

  // Step 4: Open checkout (native on Android, web otherwise)
  onStatusChange('opening_checkout');
  trackPaymentEvent('payment_checkout_opened', {
    booking_id: bookingId,
    amount: order.amount / 100,
    wallet_used_amount: walletResult?.wallet_debited ?? 0,
  });

  let checkoutResult;
  try {
    checkoutResult = await runCheckout(order);
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg === 'Payment cancelled by user') {
      console.log('🚪 User cancelled payment');
      onStatusChange('payment_cancelled');
      trackPaymentEvent('payment_cancelled', { booking_id: bookingId });
      saveLastFailure('upi', 'user_cancelled');
      throw new PaymentError('Payment cancelled by user', 'user_cancelled');
    }
    if (isNetworkError(err)) {
      onStatusChange('payment_failed');
      trackPaymentEvent('payment_failed', { booking_id: bookingId, error_type: 'network_error' });
      saveLastFailure('upi', 'network_error');
      throw new PaymentError('Network error during payment. Please check your connection and try again.', 'network_error');
    }
    onStatusChange('payment_failed');
    trackPaymentEvent('payment_failed', { booking_id: bookingId, error_type: 'payment_failed' });
    saveLastFailure('upi', 'payment_failed');
    throw new PaymentError(msg || 'Payment failed', 'payment_failed');
  }

  // Step 5: Verify on backend with retry (source of truth)
  onStatusChange('verifying_payment');
  trackPaymentEvent('payment_verification_pending', { booking_id: bookingId });
  const paymentMethod = walletResult && walletResult.wallet_debited > 0 ? 'wallet+razorpay' : 'razorpay';

  try {
    const verifyResult = await verifyWithRetry(
      bookingId,
      checkoutResult.razorpay_order_id,
      checkoutResult.razorpay_payment_id,
      checkoutResult.razorpay_signature,
    );
    onStatusChange('payment_success');
    trackPaymentEvent('payment_success', {
      booking_id: bookingId,
      payment_method: paymentMethod,
      wallet_used_amount: walletResult?.wallet_debited ?? 0,
    });
    trackPaymentEvent('payment_verified_success', { booking_id: bookingId });
    savePreferredMethod('upi');
    clearLastFailure();
    logPaymentSummary();
    return { ...verifyResult, payment_method: paymentMethod };
  } catch (verifyErr: any) {
    console.warn('⚠️ All verify attempts failed, webhook will reconcile:', verifyErr.message);
    onStatusChange('verification_pending');
    trackPaymentEvent('payment_failed', { booking_id: bookingId, error_type: 'verification_failed' });
    throw new PaymentError(
      'Payment is being verified. Please wait a moment — your booking will update automatically.',
      'verification_failed',
    );
  }
}
