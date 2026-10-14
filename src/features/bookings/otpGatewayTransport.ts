import { parseOtpResponse, type OtpResponse } from './otpContract';

export interface OtpGatewayDependencies {
  enabled: boolean;
  endpoint: string;
  apikey: string;
  getToken: (forceRefresh: boolean) => Promise<string | null>;
  fetch: typeof fetch;
  pause: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export async function retrieveBookingOtp(bookingId: string, deps: OtpGatewayDependencies, signal?: AbortSignal): Promise<OtpResponse | null> {
  if (!deps.enabled) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) throw new Error('INVALID_REQUEST');
  let token = await deps.getToken(false);
  if (!token) throw new Error('UNAUTHORIZED');
  let authRetried = false;
  // Three credential reads maximum, with one auth refresh shared across all reads.
  for (let attempt = 0; attempt < 3; attempt++) {
    const request = () => deps.fetch(deps.endpoint, {
      method: 'POST', signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', apikey: deps.apikey, 'x-firebase-token': token ?? '' },
      body: JSON.stringify({ action: 'retrieve', booking_id: bookingId }),
    });
    let res = await request();
    if ((res.status === 401 || res.status === 403) && !authRetried) {
      authRetried = true;
      token = await deps.getToken(true);
      if (!token) throw new Error('UNAUTHORIZED');
      res = await request();
    }
    // Never propagate response bodies or credentials into errors/telemetry.
    if (!res.ok) throw new Error(`OTP_GATEWAY_HTTP_${res.status}`);
    const response = parseOtpResponse(await res.json());
    if ('otp_mode' in response && response.otp_mode === 'v2' && 'reason' in response && response.reason === 'CREDENTIALS_NOT_READY' && attempt < 2) {
      await deps.pause(750 * (attempt + 1), signal);
      continue;
    }
    return response;
  }
  return null;
}