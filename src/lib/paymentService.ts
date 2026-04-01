/**
 * Payment service — wallet-first payments + Razorpay checkout.
 *
 * TWO MODES:
 * 1. Payment-first (new): No booking created until payment succeeds.
 *    Used by executePaymentFirstFlow(). On cancel → nothing to clean up.
 * 2. Legacy (existing): Booking exists before payment.
 *    Used by executePaymentFlow(). For retry/wallet-partial flows.
 *
 * SAFETY:
 * - Payment-first: no orphan bookings possible
 * - On cancel → no booking exists → nothing to clean up
 * - On verification failure → webhook handles orphan payments
 * - Backend is always source of truth
 */
import { supabase } from '@/integrations/supabase/client';
import { getFirebaseIdToken } from '@/lib/firebase';
import { runCheckout } from './checkoutRunner';
import type { CheckoutSuccessPayload } from './checkoutRunner';
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
  booking_id?: string | null;
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

/** Legacy: create order for an existing booking */
export async function createRazorpayOrder(bookingId: string): Promise<RazorpayOrderResponse> {
  console.log('🛒 Creating Razorpay order for booking:', bookingId);
  return invokeWithFirebaseAuth<RazorpayOrderResponse>('create-razorpay-order', { booking_id: bookingId });
}

/** Payment-first: create order without a booking row */
async function createRazorpayOrderDirect(params: {
  amount_inr: number;
  cust_name: string;
  cust_phone: string;
  service_type: string;
}): Promise<RazorpayOrderResponse> {
  console.log('🛒 Creating Razorpay order (payment-first):', params.amount_inr);
  return invokeWithFirebaseAuth<RazorpayOrderResponse>('create-razorpay-order', params);
}

// ─── Verification ─────────────────────────────────────────────

/** Legacy: verify + update existing booking */
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

/** Payment-first: verify + create booking */
async function verifyAndCreateBookingWithRetry(
  checkout: CheckoutSuccessPayload,
  bookingData: Record<string, any>,
  walletAmount: number,
  maxAttempts = 3,
): Promise<PaymentResult> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🔍 Verify+Create attempt ${attempt}/${maxAttempts}:`, checkout.razorpay_payment_id);
      const result = await invokeWithFirebaseAuth<PaymentResult>('verify-razorpay-payment', {
        booking_data: bookingData,
        wallet_amount: walletAmount,
        razorpay_order_id: checkout.razorpay_order_id,
        razorpay_payment_id: checkout.razorpay_payment_id,
        razorpay_signature: checkout.razorpay_signature,
      });
      console.log('✅ Verify+Create success on attempt', attempt);
      return result;
    } catch (err: any) {
      lastErr = err;
      console.warn(`⚠️ Verify+Create attempt ${attempt} failed:`, err.message);
      if (attempt < maxAttempts) await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

// ─── Checkout error handling (shared) ─────────────────────────

function handleCheckoutError(
  err: any,
  onStatusChange: (status: PaymentFlowStatus) => void,
  trackingData: Record<string, any>,
): never {
  const msg = err?.message || '';
  const errCode = err?.code || err?.data?.code || '';
  const errDesc = err?.data?.description || err?.description || msg;
  const userCancelled = msg === 'Payment cancelled by user' || err?.data?.user_cancelled === true || errCode === '2';

  console.error('❌ [PaymentFlow] Checkout failed:', {
    message: msg, code: errCode, description: errDesc, user_cancelled: userCancelled,
  });
  trackPaymentEvent('payment_failed', {
    ...trackingData,
    error_type: userCancelled ? 'user_cancelled' : isNetworkError(err) ? 'network_error' : 'payment_failed',
    raw_error: errDesc,
    error_code: errCode,
  });

  if (userCancelled) {
    onStatusChange('payment_cancelled');
    saveLastFailure('upi', 'user_cancelled');
    throw new PaymentError('Payment cancelled by user', 'user_cancelled');
  }
  if (isNetworkError(err)) {
    onStatusChange('payment_failed');
    saveLastFailure('upi', 'network_error');
    throw new PaymentError('Network error during payment. Please check your connection and try again.', 'network_error');
  }
  onStatusChange('payment_failed');
  saveLastFailure('upi', 'payment_failed');
  throw new PaymentError(errDesc || 'Payment failed', 'payment_failed');
}

// ─── Payment-First Flow (NEW) ─────────────────────────────────

/**
 * Payment-first flow: NO booking is created until payment succeeds.
 *
 * - If wallet covers full amount → create booking + debit wallet (instant, safe)
 * - If Razorpay needed → create order → checkout → verify creates booking
 * - On cancel → nothing to clean up (no booking exists)
 */
export async function executePaymentFirstFlow(
  bookingData: Record<string, any>,
  walletBalance: number,
  onStatusChange: (status: PaymentFlowStatus) => void,
): Promise<PaymentResult> {
  const price = bookingData.price_inr;
  const walletUse = Math.min(Math.max(walletBalance, 0), price);
  const razorpayAmount = price - walletUse;

  trackPaymentEvent('payment_started', { amount: price, wallet_use: walletUse });

  // ── CASE 1: Wallet covers full amount ──
  if (razorpayAmount <= 0) {
    onStatusChange('debiting_wallet');
    console.log('💰 Wallet fully covers amount, creating booking + debiting');

    // Safe to create booking here — wallet payment is instant, no user exit risk
    const { data, error } = await supabase
      .from('bookings')
      .insert([{
        ...bookingData,
        payment_status: 'pending',
        payment_method: null,
      }])
      .select('id');

    if (error) throw new Error('Failed to create booking: ' + error.message);
    const bookingId = data![0].id;

    try {
      const walletResult = await debitWalletForBooking(bookingId);
      if (walletResult.fully_paid) {
        onStatusChange('payment_success');
        trackPaymentEvent('payment_success', { booking_id: bookingId, payment_method: 'wallet', wallet_used_amount: walletUse });
        savePreferredMethod('wallet');
        clearLastFailure();
        logPaymentSummary();
        return { success: true, booking_id: bookingId, payment_method: 'wallet' };
      }
    } catch (walletErr: any) {
      console.error('Wallet debit failed:', walletErr.message);
    }

    // Wallet didn't fully cover (balance changed) — fall through to Razorpay with this booking
    console.log('⚠️ Wallet insufficient, falling back to Razorpay for booking:', bookingId);
    return executePaymentFlow(bookingId, onStatusChange);
  }

  // ── CASE 2: Razorpay needed — payment-first, NO booking until verified ──
  onStatusChange('creating_order');
  const order = await createRazorpayOrderDirect({
    amount_inr: razorpayAmount,
    cust_name: bookingData.cust_name,
    cust_phone: bookingData.cust_phone,
    service_type: bookingData.service_type,
  });

  console.log('🛒 [PaymentFirst] Order created:', JSON.stringify({
    order_id: order.order_id,
    amount_paise: order.amount,
    amount_inr: order.amount / 100,
    wallet_use: walletUse,
  }));

  onStatusChange('opening_checkout');
  trackPaymentEvent('payment_checkout_opened', { amount: razorpayAmount, wallet_used_amount: walletUse });

  let checkoutResult: CheckoutSuccessPayload;
  try {
    checkoutResult = await runCheckout(order);
  } catch (err: any) {
    // NO booking to clean up — this is the key benefit of payment-first!
    handleCheckoutError(err, onStatusChange, { wallet_used_amount: walletUse });
  }

  // Verify payment + create booking in one call
  onStatusChange('verifying_payment');
  trackPaymentEvent('payment_verification_pending', { wallet_used_amount: walletUse });
  const paymentMethod = walletUse > 0 ? 'wallet+razorpay' : 'razorpay';

  try {
    const result = await verifyAndCreateBookingWithRetry(checkoutResult!, bookingData, walletUse);
    onStatusChange('payment_success');
    trackPaymentEvent('payment_success', {
      booking_id: result.booking_id,
      payment_method: paymentMethod,
      wallet_used_amount: walletUse,
    });
    trackPaymentEvent('payment_verified_success', { booking_id: result.booking_id });
    savePreferredMethod('upi');
    clearLastFailure();
    logPaymentSummary();
    return { ...result, payment_method: paymentMethod };
  } catch (verifyErr: any) {
    console.warn('⚠️ All verify attempts failed, webhook will reconcile:', verifyErr.message);
    onStatusChange('verification_pending');
    trackPaymentEvent('payment_failed', { error_type: 'verification_failed' });
    throw new PaymentError(
      'Payment is being verified. Please wait a moment — your booking will update automatically.',
      'verification_failed',
    );
  }
}

// ─── Legacy Payment Flow (existing bookings) ──────────────────

/**
 * Legacy wallet-first flow for existing bookings (retry, wallet partial).
 * Booking must already exist in DB.
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
    trackPaymentEvent('payment_success', { booking_id: bookingId, payment_method: 'wallet', wallet_used_amount: walletResult.wallet_debited });
    savePreferredMethod('wallet');
    clearLastFailure();
    logPaymentSummary();
    return { success: true, booking_id: bookingId, payment_method: 'wallet' };
  }

  // Step 3: Create Razorpay order for remaining amount
  onStatusChange('creating_order');
  const order = await createRazorpayOrder(bookingId);

  // Step 4: Open checkout
  onStatusChange('opening_checkout');
  trackPaymentEvent('payment_checkout_opened', {
    booking_id: bookingId,
    amount: order.amount / 100,
    wallet_used_amount: walletResult?.wallet_debited ?? 0,
  });

  let checkoutResult: CheckoutSuccessPayload;
  try {
    checkoutResult = await runCheckout(order);
  } catch (err: any) {
    handleCheckoutError(err, onStatusChange, { booking_id: bookingId });
  }

  // Step 5: Verify on backend with retry
  onStatusChange('verifying_payment');
  trackPaymentEvent('payment_verification_pending', { booking_id: bookingId });
  const paymentMethod = walletResult && walletResult.wallet_debited > 0 ? 'wallet+razorpay' : 'razorpay';

  try {
    const verifyResult = await verifyWithRetry(
      bookingId,
      checkoutResult!.razorpay_order_id,
      checkoutResult!.razorpay_payment_id,
      checkoutResult!.razorpay_signature,
    );
    onStatusChange('payment_success');
    trackPaymentEvent('payment_success', { booking_id: bookingId, payment_method: paymentMethod, wallet_used_amount: walletResult?.wallet_debited ?? 0 });
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
