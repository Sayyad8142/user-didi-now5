/**
 * Profile bootstrap client.
 * Creates/links the user's profile through the bootstrap-profile edge function
 * (service-role) so RLS on `profiles` can stay strict.
 */
import { getFirebaseIdToken } from "@/lib/firebase";
import { resolveBackendUrl } from "@/lib/backendResolver";
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from "@/lib/constants";

export interface BootstrappedProfile {
  id: string;
  full_name: string;
  phone: string;
  community: string;
  flat_no: string;
  is_admin?: boolean | null;
  building_id?: string | null;
  community_id?: string | null;
  flat_id?: string | null;
  firebase_uid?: string | null;
}

export interface ProfileUpdates {
  full_name?: string;
  phone?: string;
  community?: string;
  community_id?: string | null;
  building_id?: string | null;
  flat_id?: string | null;
  flat_no?: string;
}

export interface BootstrapInput {
  phone?: string | null;
  mode?: 'signin' | 'signup' | null;
  signupData?: {
    fullName?: string;
    communityValue?: string;
    communityId?: string | null;
    buildingId?: string | null;
    flatId?: string | null;
    flatNo?: string;
  } | null;
  profileUpdates?: ProfileUpdates | null;
}

export class BootstrapProfileError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface BootstrapAttempt {
  url: string;
  status?: number;
  ok: boolean;
  error?: string;
  at: string;
}

export interface BootstrapDiagnostics {
  attempts: BootstrapAttempt[];
  lastError: string | null;
  lastRunAt: string | null;
}

const diagnostics: BootstrapDiagnostics = {
  attempts: [],
  lastError: null,
  lastRunAt: null,
};

export function getBootstrapDiagnostics(): BootstrapDiagnostics {
  return {
    attempts: [...diagnostics.attempts],
    lastError: diagnostics.lastError,
    lastRunAt: diagnostics.lastRunAt,
  };
}

export async function bootstrapProfileViaEdge(
  input: BootstrapInput = {}
): Promise<BootstrappedProfile> {
  const t0 = performance.now();
  const log = (...args: any[]) => {
    try { console.log(`[ProfileBootstrap] ${new Date().toISOString()} +${Math.round(performance.now() - t0)}ms`, ...args); } catch {}
  };

  // Run Firebase token fetch and backend URL resolution in parallel.
  const tokenPromise = getFirebaseIdToken(false).catch((e) => {
    log('token.error', e?.message);
    return null as string | null;
  });
  const backendPromise = resolveBackendUrl().catch(() => null);

  // Always try the Lovable Cloud functions URL FIRST (it is always known and
  // does not depend on the resolver finishing).
  const primaryUrl = `${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/bootstrap-profile`;
  log('primary.url', primaryUrl);

  diagnostics.attempts = [];
  diagnostics.lastError = null;
  diagnostics.lastRunAt = new Date().toISOString();

  const callOnce = async (url: string, token: string, refresh: boolean) => {
    const useToken = refresh ? (await getFirebaseIdToken(true)) || token : token;
    if (!useToken) throw new Error("Not signed in");
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: PRODUCTION_ANON_KEY,
        Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
        "x-firebase-token": useToken,
      },
      body: JSON.stringify({
        phone: input.phone ?? null,
        mode: input.mode ?? null,
        signupData: input.signupData ?? null,
        profileUpdates: input.profileUpdates ?? null,
      }),
    });
  };

  const tryUrl = async (url: string, token: string): Promise<BootstrappedProfile> => {
    let status: number | undefined;
    log('attempt.start', url);
    let res = await callOnce(url, token, false);
    if (res.status === 401 || res.status === 403) {
      log('attempt.retry_with_refreshed_token', { status: res.status });
      res = await callOnce(url, token, true);
    }
    status = res.status;
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.profile) {
      // Surface intent-enforcement errors with a typed code so callers can branch.
      if (data?.code === 'account_not_found' || data?.code === 'account_exists') {
        throw new BootstrapProfileError(
          (typeof data?.error === 'string' && data.error) || 'Account check failed',
          data.code,
          res.status,
        );
      }
      const msg = (typeof data?.error === "string" && data.error) || `Profile bootstrap failed (HTTP ${res.status})`;
      throw new Error(msg);
    }
    diagnostics.attempts.push({ url, status, ok: true, at: new Date().toISOString() });
    log('attempt.ok', { url, status });
    return data.profile as BootstrappedProfile;
  };

  // Wait for token (parallel with backend resolution above)
  const token = await tokenPromise;
  log('token.ready', { hasToken: !!token });
  if (!token) throw new Error("Not signed in");

  let lastError: Error | null = null;

  // 1) Primary: Lovable Cloud functions URL — try immediately, no resolver wait.
  try {
    return await tryUrl(primaryUrl, token);
  } catch (err: any) {
    lastError = err instanceof Error ? err : new Error(err?.message || 'Primary failed');
    diagnostics.attempts.push({
      url: primaryUrl, ok: false, error: lastError.message, at: new Date().toISOString(),
    });
    diagnostics.lastError = lastError.message;
    log('primary.failed', lastError.message);
  }

  // 2) Fallback: resolved backend URL (if different)
  const backendUrl = await backendPromise;
  if (backendUrl) {
    const fallbackUrl = `${backendUrl}/functions/v1/bootstrap-profile`;
    if (fallbackUrl !== primaryUrl) {
      try {
        log('fallback.url', fallbackUrl);
        return await tryUrl(fallbackUrl, token);
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(err?.message || 'Fallback failed');
        diagnostics.attempts.push({
          url: fallbackUrl, ok: false, error: lastError.message, at: new Date().toISOString(),
        });
        diagnostics.lastError = lastError.message;
        log('fallback.failed', lastError.message);
      }
    }
  }

  diagnostics.lastError = (lastError && lastError.message) || "Profile bootstrap failed";
  throw lastError || new Error("Profile bootstrap failed");
}

export async function updateProfileViaEdge(
  updates: ProfileUpdates
): Promise<BootstrappedProfile> {
  return bootstrapProfileViaEdge({ profileUpdates: updates });
}
