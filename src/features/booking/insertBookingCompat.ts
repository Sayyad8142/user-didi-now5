import { getFirebaseIdToken, waitForFirebaseAuthReady } from '@/lib/firebase';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';

/**
 * Insert a booking row through the `create-pending-booking` edge function.
 *
 * Why an edge function:
 *   The frontend Supabase client is anonymous (Firebase identity, not
 *   Supabase Auth), so direct INSERTs into `bookings` are blocked by RLS.
 *   The edge function authenticates via Firebase and inserts using the
 *   service role. It also handles schema-compat column stripping server-side.
 */
export async function insertBookingWithCompat(payload: Record<string, any>) {
  // Get Firebase ID token (with hydration retry — same pattern as paymentService)
  let token = await getFirebaseIdToken(false);
  if (!token) {
    const hydrated = await waitForFirebaseAuthReady(8000);
    if (hydrated) {
      try {
        token = await hydrated.getIdToken(false);
      } catch (e) {
        console.error('[insertBookingCompat] getIdToken after hydration failed:', e);
      }
    }
  }
  if (!token) {
    return {
      data: null,
      error: { message: 'Authentication expired, please login again' } as any,
    };
  }

  let data: any = null;
  try {
    const res = await fetch(`${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/create-pending-booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PRODUCTION_ANON_KEY,
        Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
        'x-firebase-token': token,
      },
      body: JSON.stringify({ booking_data: payload }),
    });

    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        data: null,
        error: { message: data?.error || `Booking failed (HTTP ${res.status})` } as any,
      };
    }
  } catch (error: any) {
    return {
      data: null,
      error: { message: error?.message || 'Booking service unreachable' } as any,
    };
  }

  if (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string') {
    return { data: null, error: { message: (data as any).error } as any };
  }

  // Match the previous return shape: array of booking rows
  const booking = (data as any)?.booking;
  return { data: booking ? [booking] : [], error: null as any };
}
