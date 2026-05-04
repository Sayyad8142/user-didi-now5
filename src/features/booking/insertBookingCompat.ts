import { supabase } from '@/integrations/supabase/client';
import { getFirebaseIdToken, waitForFirebaseAuthReady } from '@/lib/firebase';

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

  const { data, error } = await supabase.functions.invoke('create-pending-booking', {
    body: { booking_data: payload },
    headers: { 'x-firebase-token': token },
  });

  if (error) {
    // Try to surface the backend error message instead of the generic SDK one
    let backendMsg: string | null = null;
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) backendMsg = body.error;
      }
    } catch {}
    return {
      data: null,
      error: { message: backendMsg || error.message || 'Booking failed' } as any,
    };
  }

  if (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string') {
    return { data: null, error: { message: (data as any).error } as any };
  }

  // Match the previous return shape: array of booking rows
  const booking = (data as any)?.booking;
  return { data: booking ? [booking] : [], error: null as any };
}
