// ============================================================================
// Push token registration transport
// ----------------------------------------------------------------------------
// Registration is a payment-critical-grade call: if it fails, the device never
// receives notifications. We therefore do NOT go through
// supabase.functions.invoke() (which targets whichever backend the resolver
// picked — on iOS that can be a custom domain blocked by ATS, and it collapses
// every failure into an opaque "FunctionsHttpError").
//
// Instead we fetch the function host explicitly, try each candidate host in
// order, and surface the real HTTP status + response body.
// ============================================================================

import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY, DIRECT_SUPABASE_URL } from '@/lib/constants';
import { APP_VERSION_NAME } from '@/config/version';
import { getAppPlatform } from '@/utils/platform';

const FUNCTION_HOSTS = [LOVABLE_CLOUD_FUNCTIONS_URL, DIRECT_SUPABASE_URL] as const;

export interface PushTokenApiResult {
  ok: boolean;
  /** Human-readable failure reason (already includes status + body). */
  error?: string;
  status?: number;
  host?: string;
}

async function callFunction(
  name: string,
  idToken: string,
  body: Record<string, unknown>,
): Promise<PushTokenApiResult> {
  const attempts: string[] = [];

  for (const host of FUNCTION_HOSTS) {
    const url = `${host}/functions/v1/${name}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PRODUCTION_ANON_KEY,
          Authorization: `Bearer ${idToken}`,
          'x-firebase-token': idToken,
          'x-app-version': APP_VERSION_NAME,
          'x-app-platform': getAppPlatform(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const raw = await res.text();

      if (res.ok) {
        console.log(`[Push] ${name} → HTTP ${res.status} @ ${host}`, raw.slice(0, 300));
        return { ok: true, status: res.status, host };
      }

      const detail = `HTTP ${res.status} @ ${host}: ${raw.slice(0, 500) || '(empty body)'}`;
      console.error(`[Push] ${name} failed — ${detail}`);
      attempts.push(detail);

      // 4xx that are not auth/routing problems won't be fixed by another host.
      if (res.status === 400) {
        return { ok: false, status: res.status, host, error: detail };
      }
    } catch (e: any) {
      const detail = `network error @ ${host}: ${e?.name === 'AbortError' ? 'timeout after 15s' : e?.message ?? String(e)}`;
      console.error(`[Push] ${name} ${detail}`);
      attempts.push(detail);
    }
  }

  return { ok: false, error: attempts.join(' | ') || 'Unknown push registration failure' };
}

export function registerPushToken(
  idToken: string,
  token: string,
  deviceInfo: unknown,
): Promise<PushTokenApiResult> {
  return callFunction('register-user-fcm-token', idToken, { token, device_info: deviceInfo });
}

export function unregisterPushToken(
  idToken: string,
  token?: string,
): Promise<PushTokenApiResult> {
  return callFunction('unregister-user-fcm-token', idToken, { token });
}
