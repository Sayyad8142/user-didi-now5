/**
 * Customer-safe error text + log redaction for booking/checkout flows.
 * Never show raw server/database messages to customers; never log PII.
 */

export const NETWORK_ERROR_MESSAGE =
  'Network error – please check your internet connection and try again.';
export const GENERIC_BOOKING_ERROR_MESSAGE =
  "We couldn't place your booking. Please try again, or call the manager if it keeps happening.";
export const PAYMENT_UNCERTAIN_MESSAGE =
  'If any amount was taken, it will be refunded automatically. Please check My Bookings and your wallet before trying again.';
export const SLOT_UNAVAILABLE_MESSAGE =
  'This time slot is no longer available. Please pick another slot.';
export const AUTH_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

function rawMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const m = (err as any)?.message;
  return typeof m === 'string' ? m : '';
}

export function isNetworkError(err: unknown): boolean {
  return /Load failed|Failed to fetch|NetworkError|unreachable/i.test(rawMessage(err));
}

/** Maps any booking/checkout error to a friendly, non-technical message. */
export function friendlyBookingError(err: unknown): string {
  const msg = rawMessage(err);
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE;
  if (/Slot unavailable|Not enough workers/i.test(msg)) return SLOT_UNAVAILABLE_MESSAGE;
  if (/Authentication expired|login again|unauthori[sz]ed|401/i.test(msg)) return AUTH_EXPIRED_MESSAGE;
  if (/payment|razorpay|wallet|refund/i.test(msg)) return PAYMENT_UNCERTAIN_MESSAGE;
  return GENERIC_BOOKING_ERROR_MESSAGE;
}

const PII_KEYS = new Set([
  'cust_name', 'cust_phone', 'phone', 'phone_number', 'full_name', 'name', 'email',
  'flat_no', 'flatNo', 'flat_number', 'address', 'otp', 'start_otp', 'completion_otp',
  'token', 'access_token', 'id_token', 'firebase_token', 'razorpay_signature',
]);

/** Returns a shallow copy safe for console logs (PII keys replaced). */
export function redactForLog<T extends Record<string, any>>(obj: T | null | undefined): Record<string, any> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = PII_KEYS.has(k) ? (v == null ? v : '[redacted]') : v;
  }
  return out;
}

/** "+919876543210" → "******3210" */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length <= 4 ? '****' : `******${digits.slice(-4)}`;
}
