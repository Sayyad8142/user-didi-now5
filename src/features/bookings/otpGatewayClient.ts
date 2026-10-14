import { getFirebaseIdToken } from '@/lib/firebase';
import { DIRECT_SUPABASE_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';
import { retrieveBookingOtp } from './otpGatewayTransport';

// Source-only integration. Change only during an explicitly approved coordinated rollout.
export const OTP_V2_GATEWAY_ENABLED = false;

export function fetchBookingOtp(bookingId: string, signal?: AbortSignal) {
  return retrieveBookingOtp(bookingId, {
    enabled: OTP_V2_GATEWAY_ENABLED,
    endpoint: `${DIRECT_SUPABASE_URL}/functions/v1/otp-v2-gateway`,
    apikey: PRODUCTION_ANON_KEY,
    getToken: getFirebaseIdToken,
    fetch: globalThis.fetch,
    pause: (ms, abortSignal) => new Promise<void>((resolve, reject) => {
      if (abortSignal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { abortSignal?.removeEventListener('abort', abort); resolve(); }, ms);
      abortSignal?.addEventListener('abort', abort, { once: true });
    }),
  }, signal);
}