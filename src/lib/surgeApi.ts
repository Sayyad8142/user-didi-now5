/**
 * Authoritative loyalty-surge transport.
 *
 * The surge must come from the SAME source the payment validators use,
 * otherwise the client quotes one total and the backend rejects it with
 * "Price has changed. Please refresh and try again."
 *
 * Anon reads of `bookings` on the production project are denied (42501),
 * so we call the `get-user-surge` edge function with the Firebase ID token.
 */
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY, DIRECT_SUPABASE_URL } from '@/lib/constants';
import { APP_VERSION_NAME } from '@/config/version';
import { getAppPlatform } from '@/utils/platform';
import { auth } from '@/lib/firebase';
import { log } from '@/lib/logger';

const FUNCTION_HOSTS = [LOVABLE_CLOUD_FUNCTIONS_URL, DIRECT_SUPABASE_URL] as const;

export interface UserSurgeResponse {
  surge_amount: number;
  completed_count: number;
  source?: string;
}

export async function fetchUserSurge(): Promise<UserSurgeResponse> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');

  let lastError = 'unknown error';

  for (const host of FUNCTION_HOSTS) {
    const url = `${host}/functions/v1/get-user-surge`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PRODUCTION_ANON_KEY,
          Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
          'x-firebase-token': token,
          'x-app-version': String(APP_VERSION_NAME),
          'x-app-platform': getAppPlatform(),
        },
        body: JSON.stringify({}),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }

      if (res.ok && parsed && Number.isFinite(Number(parsed.surge_amount))) {
        log.info('[surgeApi] quote', { host, surge: parsed.surge_amount, completed: parsed.completed_count });
        return {
          surge_amount: Math.max(0, Math.round(Number(parsed.surge_amount))),
          completed_count: Number(parsed.completed_count ?? 0),
          source: parsed.source,
        };
      }

      lastError = `HTTP ${res.status} ${raw.slice(0, 200)}`;
      log.warn(`[surgeApi] ${url} → ${lastError}`);
    } catch (e: any) {
      lastError = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'transport error');
      log.warn(`[surgeApi] ${url} → ${lastError}`);
    }
  }

  throw new Error(`get-user-surge failed: ${lastError}`);
}
