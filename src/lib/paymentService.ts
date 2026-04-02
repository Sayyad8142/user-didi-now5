/**
 * Payment service — wallet-first payments + Razorpay checkout.
 *
 * TWO FLOWS:
 *
 * A. Payment-First (pay_now for new bookings):
 *    1. Check wallet balance
 *    2. If fully covered → call create-paid-booking with payment_type='wallet'
 *    3. Otherwise → create Razorpay order for remainder
 *    4. Open checkout
 *    5. On success → call create-paid-booking with Razorpay proof
 *    6. Backend atomically: verifies payment + creates booking + dispatches
 *    ⚠️ NO booking is created until payment is verified
 *
 * B. Legacy Flow (for retries on existing bookings):
 *    Same as before — booking already exists, just retry payment
 *
 * SAFETY:
 * - Never creates bookings before payment verification
 * - On cancel → NO booking created, NO orphan rows
 * - On failure → NO booking created
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

/** Stored checkout data for retry after verification_failed */
export interface PendingCheckoutData {
  bookingPayload: Record<string, unknown>;
  checkoutResult: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };
  razorpayAmount: number;
  walletCanCover: number;
  paymentType: 'razorpay' | 'wallet_and_razorpay';
  requestId: string;
}

export class PaymentError extends Error {
  type: PaymentErrorType;
  /** Available when type === 'verification_failed' in payment-first flow */
  pendingCheckout?: PendingCheckoutData;
  constructor(message: string, type: PaymentErrorType, pendingCheckout?: PendingCheckoutData) {
    super(message);
    this.name = 'PaymentError';
    this.type = type;
    this.pendingCheckout = pendingCheckout;
  }
}

// ─── Helpers ──────────────────────────────────────────────────

async function invokeWithFirebaseAuth<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  // Force refresh token for payment-critical calls to avoid stale tokens after checkout
  const forceRefresh = functionName === 'create-paid-booking' || functionName === 'verify-razorpay-payment';
  const token = await getFirebaseIdToken(forceRefresh);
  if (!token) throw new Error('Authentication expired, please login again');

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { 'x-firebase-token': token },
  });

  if (error) {
    // supabase.functions.invoke puts the response body in `data` even on non-2xx
    // The `error.message` is always the generic "Edge Function returned a non-2xx status code"
    const backendMessage = data?.error || data?.message;
    if (backendMessage) {
      console.error(`❌ [${functionName}] Backend error:`, backendMessage, 'step:', data?.step);
      throw new Error(backendMessage);
    }
    console.error(`❌ [${functionName}] Error:`, error.message, 'data:', JSON.stringify(data));
    throw new Error(error.message || `${functionName} failed`);
  }
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

// ─── Wallet Balance Check ─────────────────────────────────────

async function getWalletBalance(userId: string): Promise<number> {
  const { data } = await supabase
    .from('user_wallets')
    .select('balance_inr')
    .eq('user_id', userId)
    .single();
  return data?.balance_inr ?? 0;
}

// ─── Order Creation (payment-first mode) ──────────────────────

async function createRazorpayOrderForAmount(
  amount: number,
  serviceType: string,
): Promise<RazorpayOrderResponse> {
  console.log('🛒 Creating Razorpay order (payment-first), amount:', amount);
  return invokeWithFirebaseAuth<RazorpayOrderResponse>('create-razorpay-order', {
    amount,
    service_type: serviceType,
  });
}

// ─── Create Paid Booking (backend) ────────────────────────────

interface CreatePaidBookingParams {
  booking_data: Record<string, unknown>;
  payment_type: 'razorpay' | 'wallet' | 'wallet_and_razorpay';
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  razorpay_amount?: number;
  wallet_amount?: number;
}

async function createPaidBooking(params: CreatePaidBookingParams): Promise<PaymentResult> {
  console.log('📝 Creating paid booking via edge function:', params.payment_type);
  return invokeWithFirebaseAuth<PaymentResult>('create-paid-booking', params as unknown as Record<string, unknown>);
}

// ─── Legacy Helpers (for existing booking retries) ────────────

export async function debitWalletForBooking(bookingId: string): Promise<WalletPayResult> {
  console.log('💰 Debiting wallet for booking:', bookingId);
  return invokeWithFirebaseAuth<WalletPayResult>('wallet-pay', { booking_id: bookingId });
}

export async function createRazorpayOrder(bookingId: string): Promise<RazorpayOrderResponse> {
  console.log('🛒 Creating Razorpay order for booking:', bookingId);
  return invokeWithFirebaseAuth<RazorpayOrderResponse>('create-razorpay-order', { booking_id: bookingId });
}

// ─── Verification (with retry, for legacy flow) ───────────────

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

// ─── Checkout Error Handler (shared) ──────────────────────────

function handleCheckoutError(err: any, bookingId: string, onStatusChange: (s: PaymentFlowStatus) => void): never {
  const msg = err?.message || '';
  const errCode = err?.code || err?.data?.code || '';
  const errDesc = err?.data?.description || err?.description || msg;
  const userCancelled = msg === 'Payment cancelled by user' || err?.data?.user_cancelled === true || errCode === '2';

  console.error('❌ [PaymentFlow] Checkout failed:', {
    message: msg,
    code: errCode,
    description: errDesc,
    user_cancelled: userCancelled,
  });

  trackPaymentEvent('payment_failed', {
    booking_id: bookingId,
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

// ══════════════════════════════════════════════════════════════
// PAYMENT-FIRST FLOW (for new pay_now bookings)
// ══════════════════════════════════════════════════════════════

/**
 * Payment-first flow for new bookings.
 *
 * CRITICAL: NO booking is inserted into the database until payment
 * is fully verified. If user cancels or payment fails, nothing
 * is created in the database.
 *
 * @param bookingPayload - Full booking data (same shape as DB insert)
 * @param onStatusChange - UI status callback
 * @returns PaymentResult with booking_id from the newly created booking
 */
export async function executePaymentFlowForNewBooking(
  bookingPayload: Record<string, unknown>,
  onStatusChange: (status: PaymentFlowStatus) => void,
): Promise<PaymentResult> {
  const priceInr = bookingPayload.price_inr as number;
  const userId = bookingPayload.user_id as string;
  const serviceType = bookingPayload.service_type as string;

  trackPaymentEvent('payment_first_started', { service_type: serviceType, amount: priceInr });

  // Step 1: Check wallet balance
  onStatusChange('debiting_wallet');
  let walletBalance = 0;
  try {
    walletBalance = await getWalletBalance(userId);
    console.log('💰 Wallet balance:', walletBalance);
  } catch (e) {
    console.warn('⚠️ Could not fetch wallet balance:', e);
  }

  const walletCanCover = Math.min(walletBalance, priceInr);
  const razorpayAmount = priceInr - walletCanCover;

  // Step 2: If wallet fully covers the price
  if (razorpayAmount <= 0 && walletCanCover >= priceInr) {
    console.log('✅ Wallet fully covers ₹' + priceInr);
    onStatusChange('verifying_payment');

    // Generate idempotency key to prevent duplicate bookings on retries
    const requestId = crypto.randomUUID();
    const payloadWithRequestId = { ...bookingPayload, request_id: requestId };

    try {
      const result = await createPaidBooking({
        booking_data: payloadWithRequestId,
        payment_type: 'wallet',
        wallet_amount: priceInr,
      });

      onStatusChange('payment_success');
      trackPaymentEvent('payment_success', {
        booking_id: result.booking_id,
        payment_method: 'wallet',
        wallet_used_amount: priceInr,
      });
      savePreferredMethod('wallet');
      clearLastFailure();
      logPaymentSummary();
      return result;
    } catch (err: any) {
      console.error('❌ Wallet-only booking creation failed:', err);
      onStatusChange('payment_failed');
      throw new PaymentError(err.message || 'Wallet payment failed', 'payment_failed');
    }
  }

  // Step 3: Create Razorpay order for remainder
  onStatusChange('creating_order');
  const order = await createRazorpayOrderForAmount(razorpayAmount, serviceType);

  console.log('🛒 [PaymentFirst] Order created:', JSON.stringify({
    order_id: order.order_id,
    amount_paise: order.amount,
    amount_inr: order.amount / 100,
    wallet_portion: walletCanCover,
    razorpay_portion: razorpayAmount,
  }));

  // Step 4: Open checkout
  onStatusChange('opening_checkout');
  trackPaymentEvent('payment_checkout_opened', {
    amount: razorpayAmount,
    wallet_used_amount: walletCanCover,
  });

  let checkoutResult;
  try {
    checkoutResult = await runCheckout(order);
  } catch (err: any) {
    // Payment cancelled or failed — NO booking created
    handleCheckoutError(err, 'pending', onStatusChange);
  }

  // Step 5: Payment succeeded — now create booking + verify atomically
  onStatusChange('verifying_payment');
  trackPaymentEvent('payment_verification_pending', { order_id: order.order_id });

  const paymentType = walletCanCover > 0 ? 'wallet_and_razorpay' : 'razorpay';

  // Generate idempotency key for Razorpay flow too
  const razorpayRequestId = crypto.randomUUID();
  const razorpayPayloadWithRequestId = { ...bookingPayload, request_id: razorpayRequestId };

  try {
    const result = await createPaidBooking({
      booking_data: razorpayPayloadWithRequestId,
      payment_type: paymentType,
      razorpay_order_id: checkoutResult!.razorpay_order_id,
      razorpay_payment_id: checkoutResult!.razorpay_payment_id,
      razorpay_signature: checkoutResult!.razorpay_signature,
      razorpay_amount: order.amount,
      wallet_amount: walletCanCover > 0 ? walletCanCover : undefined,
    });

    onStatusChange('payment_success');
    trackPaymentEvent('payment_success', {
      booking_id: result.booking_id,
      payment_method: paymentType,
      wallet_used_amount: walletCanCover,
    });
    savePreferredMethod('upi');
    clearLastFailure();
    logPaymentSummary();
    return result;
  } catch (verifyErr: any) {
    console.error('❌ create-paid-booking failed after successful checkout:', verifyErr);
    // Payment was captured but booking creation failed.
    // Attach checkout data so the UI can retry createPaidBooking.
    onStatusChange('verification_pending');
    trackPaymentEvent('payment_failed', {
      error_type: 'verification_failed',
      razorpay_payment_id: checkoutResult!.razorpay_payment_id,
    });
    throw new PaymentError(
      'Payment received but booking creation is pending. Tap retry to complete.',
      'verification_failed',
      {
        bookingPayload: razorpayPayloadWithRequestId,
        checkoutResult: checkoutResult!,
        razorpayAmount,
        walletCanCover,
        paymentType,
        requestId: razorpayRequestId,
      },
    );
  }
}

/**
 * Retry booking creation after a verification_failed error.
 * Re-calls create-paid-booking with the same idempotent request_id.
 */
export async function retryPendingBookingCreation(
  pending: PendingCheckoutData,
  onStatusChange: (status: PaymentFlowStatus) => void,
): Promise<PaymentResult> {
  onStatusChange('verifying_payment');
  console.log('🔄 Retrying create-paid-booking with request_id:', pending.requestId);

  const result = await createPaidBooking({
    booking_data: pending.bookingPayload,
    payment_type: pending.paymentType,
    razorpay_order_id: pending.checkoutResult.razorpay_order_id,
    razorpay_payment_id: pending.checkoutResult.razorpay_payment_id,
    razorpay_signature: pending.checkoutResult.razorpay_signature,
    razorpay_amount: pending.razorpayAmount,
    wallet_amount: pending.walletCanCover > 0 ? pending.walletCanCover : undefined,
  });

  onStatusChange('payment_success');
  trackPaymentEvent('payment_success', {
    booking_id: result.booking_id,
    payment_method: pending.paymentType,
    wallet_used_amount: pending.walletCanCover,
  });
  savePreferredMethod('upi');
  clearLastFailure();
  logPaymentSummary();
  return result;
}

// ══════════════════════════════════════════════════════════════
// LEGACY FLOW (for retries on existing bookings)
// ══════════════════════════════════════════════════════════════

/**
 * Legacy payment flow for EXISTING bookings.
 * Used for retry scenarios where booking already exists in DB.
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

  // Step 4: Open checkout
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
    handleCheckoutError(err, bookingId, onStatusChange);
  }

  // Step 5: Verify on backend with retry
  onStatusChange('verifying_payment');
  const paymentMethod = walletResult && walletResult.wallet_debited > 0 ? 'wallet+razorpay' : 'razorpay';

  try {
    const verifyResult = await verifyWithRetry(
      bookingId,
      checkoutResult!.razorpay_order_id,
      checkoutResult!.razorpay_payment_id,
      checkoutResult!.razorpay_signature,
    );
    onStatusChange('payment_success');
    trackPaymentEvent('payment_success', {
      booking_id: bookingId,
      payment_method: paymentMethod,
      wallet_used_amount: walletResult?.wallet_debited ?? 0,
    });
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
