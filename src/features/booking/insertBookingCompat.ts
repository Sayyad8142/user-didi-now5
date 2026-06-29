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
  const preferredWorkerId = (payload as any)?.preferred_worker_id ?? null;
  console.log('[FAV_TRACE] insertBookingWithCompat START', {
    preferred_worker_id: preferredWorkerId,
    payment_method: (payload as any)?.payment_method ?? null,
    payment_status: (payload as any)?.payment_status ?? null,
  });

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
  const url = `${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/create-pending-booking`;
  console.log('[FAV_TRACE] insertBookingWithCompat → fetch START', {
    url,
    preferred_worker_id: preferredWorkerId,
  });
  try {
    const res = await fetch(url, {
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
    console.log('[FAV_TRACE] insertBookingWithCompat → fetch END', {
      status: res.status,
      ok: res.ok,
      booking_id: data?.booking?.id ?? null,
      preferred_worker_fallback_used: data?.preferred_worker_fallback_used ?? false,
      error: data?.error ?? null,
    });
    if (!res.ok) {
      return {
        data: null,
        error: { message: data?.error || `Booking failed (HTTP ${res.status})` } as any,
      };
    }
  } catch (error: any) {
    console.error('[FAV_TRACE] insertBookingWithCompat → fetch THREW', {
      preferred_worker_id: preferredWorkerId,
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
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
  return {
    data: booking ? [booking] : [],
    error: null as any,
    preferred_worker_fallback_used: Boolean((data as any)?.preferred_worker_fallback_used),
    requested_preferred_worker_id: (data as any)?.requested_preferred_worker_id ?? null,
  };
}

