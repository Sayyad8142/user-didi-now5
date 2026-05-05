import { getFirebaseIdToken, waitForFirebaseAuthReady } from '@/lib/firebase';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';
import { resolveBackendUrl } from '@/lib/backendResolver';

export async function fetchMyBookings(limit = 50) {
  let token = await getFirebaseIdToken(false);
  if (!token) {
    const hydrated = await waitForFirebaseAuthReady(8000);
    if (hydrated) token = await hydrated.getIdToken(false).catch(() => null);
  }
  if (!token) throw new Error('Authentication expired, please login again');

  const backendUrl = await resolveBackendUrl();
  const urls = [
    `${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/bookings-read`,
    ...(backendUrl ? [`${backendUrl}/functions/v1/bookings-read`] : []),
  ].filter((url, index, all) => all.indexOf(url) === index);

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      let res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PRODUCTION_ANON_KEY,
          Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
          'x-firebase-token': token,
        },
        body: JSON.stringify({ limit }),
      });

      if (res.status === 401 || res.status === 403) {
        const freshToken = await getFirebaseIdToken(true);
        if (freshToken) {
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: PRODUCTION_ANON_KEY,
              Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
              'x-firebase-token': freshToken,
            },
            body: JSON.stringify({ limit }),
          });
        }
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Bookings failed (HTTP ${res.status})`);
      return (data?.bookings || []) as any[];
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || 'Failed to load bookings');
      console.warn('[bookings-read] endpoint failed, trying fallback if available', { url, error: lastError.message });
    }
  }

  throw lastError || new Error('Failed to load bookings');
}