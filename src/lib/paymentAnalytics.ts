/**
 * Payment analytics — lightweight, async, provider-agnostic.
 *
 * Tracks every step of the payment funnel for drop-off analysis
 * and stores user preferences for smart method ordering.
 *
 * Future: plug into Firebase Analytics / Mixpanel / Segment
 * by replacing the `dispatch` function.
 */
import { getAppPlatform } from '@/utils/platform';

// ─── Event types ──────────────────────────────────────────────

export type PaymentEventName =
  | 'booking_created'
  | 'payment_started'
  | 'payment_checkout_opened'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_cancelled'
  | 'payment_retry_clicked'
  | 'payment_method_selected'
  | 'payment_verification_pending'
  | 'payment_verified_success';

export interface PaymentEventPayload {
  booking_id?: string;
  user_id?: string;
  payment_method?: string; // 'upi' | 'card' | 'wallet' | 'pay_after_service' | 'wallet+razorpay'
  platform?: string;
  amount?: number;
  wallet_used_amount?: number;
  error_type?: string;
  retry_count?: number;
  [key: string]: unknown;
}

// ─── Session stats (in-memory) ────────────────────────────────

interface PaymentStats {
  total: number;
  success: number;
  failed: number;
  cancelled: number;
  retrySuccess: number;
}

const sessionStats: PaymentStats = {
  total: 0,
  success: 0,
  failed: 0,
  cancelled: 0,
  retrySuccess: 0,
};

// ─── Core dispatch (async, non-blocking) ──────────────────────

function dispatch(event: PaymentEventName, payload: PaymentEventPayload) {
  // Non-blocking — fire and forget
  queueMicrotask(() => {
    const enriched = {
      event,
      ...payload,
      platform: payload.platform || getAppPlatform(),
      timestamp: new Date().toISOString(),
    };

    // Console log for debugging (structured)
    console.log(`📊 [payment_analytics] ${event}`, enriched);

    // Update session stats
    if (event === 'payment_started') sessionStats.total++;
    if (event === 'payment_success') sessionStats.success++;
    if (event === 'payment_failed') sessionStats.failed++;
    if (event === 'payment_cancelled') sessionStats.cancelled++;
    if (event === 'payment_retry_clicked' && payload.retry_count && payload.retry_count > 1) {
      // Will be counted as retrySuccess if followed by success
    }

    // Future: send to analytics provider here
    // e.g. firebase.analytics().logEvent(event, enriched);
  });
}

// ─── Public API ───────────────────────────────────────────────

export function trackPaymentEvent(event: PaymentEventName, payload: PaymentEventPayload = {}) {
  dispatch(event, payload);
}

export function getPaymentStats(): PaymentStats {
  return { ...sessionStats };
}

export function logPaymentSummary() {
  const s = sessionStats;
  const rate = s.total > 0 ? Math.round((s.success / s.total) * 100) : 0;
  console.log(`📊 [payment_summary] total=${s.total} success=${s.success} failed=${s.failed} cancelled=${s.cancelled} rate=${rate}%`);
}

// ─── Preferred Payment Method ─────────────────────────────────

const PREF_KEY = 'didi_preferred_payment_method';
const PREF_DETAIL_KEY = 'didi_preferred_payment_detail';
const LAST_FAILURE_KEY = 'didi_last_payment_failure';

export type PreferredMethod = 'upi' | 'card' | 'wallet' | 'pay_after_service';

export function savePreferredMethod(method: PreferredMethod, detail?: string) {
  try {
    localStorage.setItem(PREF_KEY, method);
    if (detail) localStorage.setItem(PREF_DETAIL_KEY, detail);
  } catch { /* quota / private browsing */ }
}

export function getPreferredMethod(): PreferredMethod | null {
  try {
    return localStorage.getItem(PREF_KEY) as PreferredMethod | null;
  } catch { return null; }
}

export function getPreferredMethodDetail(): string | null {
  try {
    return localStorage.getItem(PREF_DETAIL_KEY);
  } catch { return null; }
}

export function saveLastFailure(method: string, errorType: string) {
  try {
    localStorage.setItem(LAST_FAILURE_KEY, JSON.stringify({ method, errorType, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function getLastFailure(): { method: string; errorType: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(LAST_FAILURE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearLastFailure() {
  try { localStorage.removeItem(LAST_FAILURE_KEY); } catch { /* ignore */ }
}

// ─── Retry Intelligence ───────────────────────────────────────

export function getRetrySuggestion(errorType: string): string | null {
  const lastFail = getLastFailure();

  if (errorType === 'user_cancelled') {
    return null; // Same method is fine
  }

  if (errorType === 'payment_failed') {
    if (lastFail?.method === 'upi' || !lastFail) {
      return 'Try Card or Netbanking instead';
    }
    if (lastFail?.method === 'card') {
      return 'Try UPI — Google Pay or PhonePe';
    }
  }

  if (errorType === 'network_error') {
    return 'Check your connection and try again';
  }

  return null;
}

// ─── Cashback hook (placeholder — not active) ─────────────────

export interface CashbackOffer {
  enabled: boolean;
  method: PreferredMethod;
  amount: number;
  message: string;
}

export function getCashbackOffer(_method: PreferredMethod, _amount: number): CashbackOffer | null {
  // Placeholder — return null until cashback is activated
  // Future: return { enabled: true, method: 'upi', amount: 10, message: '₹10 cashback on UPI!' }
  return null;
}
