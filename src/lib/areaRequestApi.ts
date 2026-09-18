/**
 * "Request Didi Now in Your Area" transport.
 *
 * Signup happens before a Firebase session exists, so this call works
 * unauthenticated; when a token IS available we send it and the backend
 * resolves the profile itself (never a client-supplied user id).
 */
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY, DIRECT_SUPABASE_URL } from '@/lib/constants';
import { APP_VERSION_NAME } from '@/config/version';
import { getAppPlatform } from '@/utils/platform';
import { getFirebaseIdToken } from '@/lib/firebase';
import { log } from '@/lib/logger';

const FUNCTION_HOSTS = [LOVABLE_CLOUD_FUNCTIONS_URL, DIRECT_SUPABASE_URL] as const;

export interface AreaRequestInput {
  requestedArea: string;
  searchText?: string | null;
  phone?: string | null;
}

export async function submitAreaRequest(input: AreaRequestInput): Promise<{ duplicate: boolean }> {
  let token: string | null = null;
  try {
    token = await getFirebaseIdToken(false);
  } catch {
    token = null;
  }

  let lastError = 'Could not save your request. Please try again.';

  for (const host of FUNCTION_HOSTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${host}/functions/v1/submit-area-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PRODUCTION_ANON_KEY,
          Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
          ...(token ? { 'x-firebase-token': token } : {}),
          'x-app-version': String(APP_VERSION_NAME),
          'x-app-platform': getAppPlatform(),
        },
        body: JSON.stringify({
          requested_area: input.requestedArea,
          search_text: input.searchText ?? null,
          phone: input.phone ?? null,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }

      if (res.ok && parsed?.ok) {
        log.info('[areaRequest] saved', { host, duplicate: !!parsed.duplicate });
        return { duplicate: !!parsed.duplicate };
      }
      lastError = parsed?.error || `Request failed (${res.status})`;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }

  throw new Error(lastError);
}
