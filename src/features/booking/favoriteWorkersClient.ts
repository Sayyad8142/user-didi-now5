import { getFirebaseIdToken, waitForFirebaseAuthReady } from '@/lib/firebase';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';
import { resolveBackendUrl } from '@/lib/backendResolver';
import type { FavoriteWorker } from '@/hooks/useFavoriteWorkers';

/**
 * Service-role proxy for the previous/favorite-worker history.
 * The direct client RPC (get_favorite_workers) is not executable by the
 * anon role on the production DB (Postgres 42501), so this proxy is the
 * reliable path. The user id is resolved server-side from the Firebase token.
 */
export async function fetchFavoriteWorkersViaProxy(
  serviceType: string,
  community: string,
  clientRpcError?: string,
): Promise<FavoriteWorker[]> {
  let token = await getFirebaseIdToken(false);
  if (!token) {
    const hydrated = await waitForFirebaseAuthReady(8000);
    if (hydrated) token = await hydrated.getIdToken(false).catch(() => null);
  }
  if (!token) throw new Error('Please log in to see your previous experts');

  const backendUrl = await resolveBackendUrl();
  const urls = [
    `${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/list-favorite-workers`,
    ...(backendUrl ? [`${backendUrl}/functions/v1/list-favorite-workers`] : []),
  ].filter((url, i, all) => all.indexOf(url) === i);

  const payload = JSON.stringify({
    service_type: serviceType,
    community,
    client_rpc_error: clientRpcError,
  });

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PRODUCTION_ANON_KEY,
          Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
          'x-firebase-token': token,
        },
        body: payload,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (HTTP ${res.status})`);
      return (data?.workers || []) as FavoriteWorker[];
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || 'Failed to load experts');
      console.warn('[list-favorite-workers] endpoint failed', { url, error: lastError.message });
    }
  }

  throw lastError || new Error('Failed to load your previous experts');
}
