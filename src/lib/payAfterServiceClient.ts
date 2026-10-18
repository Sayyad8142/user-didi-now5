import { getFirebaseIdToken } from '@/lib/firebase';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';

/** Asks the server to switch an unpaid booking to pay-after-service. Never writes the booking directly. */
export async function switchToPayAfterService(bookingId: string): Promise<boolean> {
  const call = async (force: boolean) => {
    const token = await getFirebaseIdToken(force);
    if (!token) return null;
    return fetch(`${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/switch-to-pay-after-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PRODUCTION_ANON_KEY,
        Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
        'x-firebase-token': token,
      },
      body: JSON.stringify({ booking_id: bookingId }),
    });
  };
  try {
    let res = await call(false);
    if (res && (res.status === 401 || res.status === 403)) res = await call(true);
    if (!res?.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data?.success === true;
  } catch {
    return false;
  }
}
