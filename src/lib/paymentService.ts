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
import { runCheckout, type CheckoutResult } from './checkoutRunner';
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

function normalizeScheduledTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value;
  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  return `${hours}:${minutes}:00`;
}

function sanitizeBookingDataForCreatePaidBooking(bookingData: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...bookingData };

  delete sanitized.slot_surge_amount;
  delete sanitized.slot_surge_time;
  delete sanitized.request_id;

  if (sanitized.price_inr == null && sanitized.price != null) {
    sanitized.price_inr = sanitized.price;
  }
  if (typeof sanitized.price_inr === 'string') {
    const parsedPrice = Number(sanitized.price_inr);
    sanitized.price_inr = Number.isFinite(parsedPrice) ? parsedPrice : sanitized.price_inr;
  }
  delete sanitized.price;

  const normalizedBookingType =
    sanitized.booking_type === 'scheduled' || (sanitized.scheduled_date && sanitized.scheduled_time)
      ? 'scheduled'
      : 'instant';
  sanitized.booking_type = normalizedBookingType;

  if (normalizedBookingType === 'scheduled') {
    const normalizedTime = normalizeScheduledTime(sanitized.scheduled_time);
    if (normalizedTime) {
      sanitized.scheduled_time = normalizedTime;
    }
  } else {
    sanitized.scheduled_date = null;
    sanitized.scheduled_time = null;
  }

  return sanitized;
}

function maskSensitivePayloadForLogs(body: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...body } as Record<string, unknown>;
  const signature = payload.razorpay_signature;
  if (typeof signature === 'string' && signature.length > 12) {
    payload.razorpay_signature = `${signature.slice(0, 6)}…${signature.slice(-4)}`;
  }
  return payload;
}

function extractFunctionHttpStatus(error: any): number | null {
  const status = error?.context?.status ?? error?.status ?? error?.response?.status ?? null;
  return typeof status === 'number' ? status : null;
}

function formatFunctionErrorMessage(functionName: string, error: any, data: unknown): string {
  if (typeof data === 'string' && data.trim()) return data;

  if (data && typeof data === 'object') {
    const responseBody = data as Record<string, unknown>;
    const backendMessage =
      (typeof responseBody.error === 'string' && responseBody.error) ||
      (typeof responseBody.message === 'string' && responseBody.message) ||
      null;

    if (backendMessage) return backendMessage;

    try {
      const serialized = JSON.stringify(responseBody);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // ignore JSON stringify failures and fall through to the generic message
    }
  }

  return error?.message || `${functionName} failed`;
}

function logCreatePaidBookingDebug(stage: 'request' | 'response' | 'error', details: Record<string, unknown>) {
  console.log('CREATE_PAID_BOOKING_DEBUG', { stage, ...details });
}

async function invokeWithFirebaseAuth<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  // Force refresh token for payment-critical calls to avoid stale tokens after checkout
  const forceRefresh = functionName === 'create-paid-booking' || functionName === 'verify-razorpay-payment';
  const token = await getFirebaseIdToken(forceRefresh);
  if (!token) throw new Error('Authentication expired, please login again');

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { 'x-firebase-token': token },
  });

  const httpStatus = extractFunctionHttpStatus(error);

  if (functionName === 'create-paid-booking') {
    logCreatePaidBookingDebug(error ? 'error' : 'response', {
      functionName,
      httpStatus: httpStatus ?? (error ? null : 200),
      responseBody: data ?? null,
      errorMessage: error?.message ?? null,
    });
  }

  if (error) {
    const backendMessage = formatFunctionErrorMessage(functionName, error, data);
    console.error(`❌ [${functionName}] Error:`, {
      httpStatus,
      errorMessage: error.message,
      responseBody: data ?? null,
    });
    throw new Error(backendMessage || error.message || `${functionName} failed`);
  }

  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }

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
  request_id?: string;
  booking_data: Record<string, unknown>;
  payment_type: 'razorpay' | 'wallet' | 'wallet_and_razorpay';
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  razorpay_amount?: number;
  wallet_amount?: number;
}

async function createPaidBooking(params: CreatePaidBookingParams): Promise<PaymentResult> {
  const requestId =
    (typeof params.request_id === 'string' && params.request_id) ||
    (typeof params.booking_data.request_id === 'string' && params.booking_data.request_id) ||
    undefined;

  const payload: Record<string, unknown> = {
    ...params,
    booking_data: sanitizeBookingDataForCreatePaidBooking(params.booking_data),
  };
  if (requestId) payload.request_id = requestId;
  const maskedPayload = maskSensitivePayloadForLogs(payload);

  console.log('📝 Creating paid booking via edge function:', params.payment_type);
  console.log('CREATE_PAID_BOOKING_PAYLOAD', maskedPayload);
  logCreatePaidBookingDebug('request', {
    functionName: 'create-paid-booking',
    payload: maskedPayload,
  });

  return invokeWithFirebaseAuth<PaymentResult>('create-paid-booking', payload);
}

// ─── QR Payment Recovery ──────────────────────────────────────

interface OrderCheckResult {
  paid: boolean;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  amount?: number;
}

/**
 * Checks with Razorpay if an order has been paid (for QR payment recovery).
 * Polls up to 3 times with 3s delay to allow payment processing.
 */
async function checkRazorpayOrderPayment(orderId: string): Promise<OrderCheckResult> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`🔍 Checking order payment status, attempt ${attempt}/3`);
    try {
      const result = await invokeWithFirebaseAuth<OrderCheckResult>('check-razorpay-order', {
        order_id: orderId,
      });
      if (result.paid) return result;
    } catch (err) {
      console.warn(`⚠️ Order check attempt ${attempt} failed:`, err);
    }
    if (attempt < 3) await sleep(3000);
  }
  return { paid: false };
}

/**
 * Creates a paid booking after QR payment recovery (no signature available).
 * Uses a server-side verified payment — the edge function will verify
 * the payment directly with Razorpay instead of using HMAC signature.
 */
async function createPaidBookingAfterQrPayment(params: Omit<CreatePaidBookingParams, 'razorpay_signature'>): Promise<PaymentResult> {
  const payload: Record<string, unknown> = {
    ...params,
    booking_data: sanitizeBookingDataForCreatePaidBooking(params.booking_data as Record<string, unknown>),
    // Signal to backend that this is a QR recovery — verify payment server-side
    qr_recovery: true,
  };
  if (params.request_id) payload.request_id = params.request_id;

  console.log('📝 Creating paid booking after QR recovery:', params.payment_type);
  logCreatePaidBookingDebug('request', {
    functionName: 'create-paid-booking',
    payload: maskSensitivePayloadForLogs(payload),
    qr_recovery: true,
  });

  return invokeWithFirebaseAuth<PaymentResult>('create-paid-booking', payload);
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
        request_id: requestId,
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

  const checkoutResult: CheckoutResult = await runCheckout(order);

  // Step 4b: Handle checkout result
  if (checkoutResult.status === 'failed') {
    handleCheckoutError(
      new Error(checkoutResult.error || 'Payment failed'),
      'pending',
      onStatusChange,
    );
  }

  if (checkoutResult.status === 'dismissed') {
    // User dismissed overlay — but may have paid via QR/UPI.
    // Poll Razorpay to check if payment actually went through.
    console.log('🔍 Checkout dismissed — checking if payment was captured for order:', order.order_id);
    onStatusChange('verifying_payment');

    const orderCheck = await checkRazorpayOrderPayment(order.order_id);
    if (!orderCheck.paid) {
      console.log('❌ No payment found after dismiss — treating as cancelled');
      onStatusChange('payment_cancelled');
      saveLastFailure('upi', 'user_cancelled');
      throw new PaymentError('Payment cancelled by user', 'user_cancelled');
    }

    // Payment WAS captured via QR! Use the payment details.
    console.log('✅ Payment found after dismiss:', orderCheck.razorpay_payment_id);
    trackPaymentEvent('payment_recovered_after_dismiss', {
      order_id: order.order_id,
      payment_id: orderCheck.razorpay_payment_id,
    });

    // For QR payments we don't have a signature — create booking without signature verification
    // The edge function will skip HMAC check if we pass a special flag
    const razorpayRequestId = crypto.randomUUID();
    const razorpayPayloadWithRequestId = { ...bookingPayload, request_id: razorpayRequestId };
    const paymentType = walletCanCover > 0 ? 'wallet_and_razorpay' : 'razorpay';

    // We need to verify via the order check — create booking using webhook-style verification
    // Since we can't get the signature for QR payments, use verify-razorpay-payment flow
    try {
      const result = await createPaidBookingAfterQrPayment({
        request_id: razorpayRequestId,
        booking_data: razorpayPayloadWithRequestId,
        payment_type: paymentType,
        razorpay_order_id: order.order_id,
        razorpay_payment_id: orderCheck.razorpay_payment_id!,
        razorpay_amount: order.amount,
        wallet_amount: walletCanCover > 0 ? walletCanCover : undefined,
      });

      onStatusChange('payment_success');
      trackPaymentEvent('payment_success', {
        booking_id: result.booking_id,
        payment_method: paymentType,
        wallet_used_amount: walletCanCover,
        recovered_from_dismiss: true,
      });
      savePreferredMethod('upi');
      clearLastFailure();
      logPaymentSummary();
      return result;
    } catch (qrErr: any) {
      console.error('❌ Booking creation failed after QR payment recovery:', qrErr);
      onStatusChange('verification_pending');
      throw new PaymentError(
        qrErr?.message || 'Payment received but booking creation is pending. Tap retry to complete.',
        'verification_failed',
        {
          bookingPayload: razorpayPayloadWithRequestId,
          checkoutResult: {
            razorpay_order_id: order.order_id,
            razorpay_payment_id: orderCheck.razorpay_payment_id!,
            razorpay_signature: '', // No signature for QR payments
          },
          razorpayAmount,
          walletCanCover,
          paymentType,
          requestId: razorpayRequestId,
        },
      );
    }
  }

  // Step 5: Payment succeeded via handler — create booking + verify atomically
  onStatusChange('verifying_payment');
  trackPaymentEvent('payment_verification_pending', { order_id: order.order_id });

  const paymentType = walletCanCover > 0 ? 'wallet_and_razorpay' : 'razorpay';

  // Generate idempotency key for Razorpay flow too
  const razorpayRequestId = crypto.randomUUID();
  const razorpayPayloadWithRequestId = { ...bookingPayload, request_id: razorpayRequestId };

  try {
    const result = await createPaidBooking({
        request_id: razorpayRequestId,
      booking_data: razorpayPayloadWithRequestId,
      payment_type: paymentType,
      razorpay_order_id: checkoutResult.payload!.razorpay_order_id,
      razorpay_payment_id: checkoutResult.payload!.razorpay_payment_id,
      razorpay_signature: checkoutResult.payload!.razorpay_signature,
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
    onStatusChange('verification_pending');
    trackPaymentEvent('payment_failed', {
      error_type: 'verification_failed',
      razorpay_payment_id: checkoutResult.payload!.razorpay_payment_id,
    });
    throw new PaymentError(
      verifyErr?.message || 'Payment received but booking creation is pending. Tap retry to complete.',
      'verification_failed',
      {
        bookingPayload: razorpayPayloadWithRequestId,
        checkoutResult: checkoutResult.payload!,
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
    request_id: pending.requestId,
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
