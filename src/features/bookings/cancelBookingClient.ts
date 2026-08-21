import { getFirebaseIdToken, waitForFirebaseAuthReady } from '@/lib/firebase';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';
import { resolveBackendUrl } from '@/lib/backendResolver';

export interface CancelBookingResponse {
  success?: boolean;
  already_cancelled?: boolean;
  refund?: {
    refunded?: boolean;
    skipped?: boolean;
    reason?: string;
    paid_amount?: number;
    refund_amount?: number;
  } | null;
}

/**
 * Cancels a booking through the cancel-booking edge function.
 * The anonymous Supabase client cannot execute the user_cancel_booking RPC
 * ("permission denied for function"), so cancellation is proxied server-side.
 */
export async function cancelMyBooking(bookingId: string, reason: string) {
  let token = await getFirebaseIdToken(false);
  if (!token) {
    const hydrated = await waitForFirebaseAuthReady(8000);
    if (hydrated) token = await hydrated.getIdToken(false).catch(() => null);
  }
  if (!token) throw new Error('Authentication expired, please login again');

  const backendUrl = await resolveBackendUrl();
  const urls = [
    `${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/cancel-booking`,
    ...(backendUrl ? [`${backendUrl}/functions/v1/cancel-booking`] : []),
  ].filter((url, index, all) => all.indexOf(url) === index);

  const payload = JSON.stringify({ booking_id: bookingId, reason });
  const headersFor = (t: string) => ({
    'Content-Type': 'application/json',
    apikey: PRODUCTION_ANON_KEY,
    Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
    'x-firebase-token': t,
  });

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      let res = await fetch(url, { method: 'POST', headers: headersFor(token), body: payload });

      if (res.status === 401) {
        const fresh = await getFirebaseIdToken(true);
        if (fresh) {
          res = await fetch(url, { method: 'POST', headers: headersFor(fresh), body: payload });
        }
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Cancellation failed (HTTP ${res.status})`);
      return data as CancelBookingResponse;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || 'Failed to cancel booking');
      console.warn('[cancel-booking] endpoint failed, trying fallback if available', {
        url,
        error: lastError.message,
      });
    }
  }

  throw lastError || new Error('Failed to cancel booking');
}
