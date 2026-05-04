import { resolveBackendUrl } from '@/lib/backendResolver';
import { PRODUCTION_ANON_KEY } from '@/lib/constants';
import { getFirebaseIdToken } from '@/lib/firebase';

export type EnsuredProfile = {
  id: string;
  full_name: string;
  phone: string;
  community: string;
  flat_no: string;
  building_id?: string | null;
  community_id?: string | null;
  flat_id?: string | null;
  firebase_uid?: string | null;
};

export type EnsureProfileInput = {
  full_name?: string;
  community?: string;
  community_id?: string | null;
  building_id?: string | null;
  flat_id?: string | null;
  flat_no?: string;
};

/**
 * Ensure a profile row exists for the current Firebase user via the
 * `ensure-profile` edge function. The edge function uses the service role
 * (after verifying the Firebase token) so RLS does not block the insert.
 */
export async function callEnsureProfile(
  input: EnsureProfileInput = {}
): Promise<EnsuredProfile> {
  const token = await getFirebaseIdToken(false);
  if (!token) throw new Error('Not signed in to Firebase');

  const backend = await resolveBackendUrl();
  if (!backend) throw new Error('No reachable backend');

  const url = `${backend}/functions/v1/ensure-profile`;

  const doFetch = async (forceFresh: boolean) => {
    const tk = forceFresh ? await getFirebaseIdToken(true) : token;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PRODUCTION_ANON_KEY,
        Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
        'x-firebase-token': tk || '',
      },
      body: JSON.stringify(input || {}),
    });
  };

  let res = await doFetch(false);
  if ((res.status === 401 || res.status === 403) && !res.ok) {
    res = await doFetch(true);
  }

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok || !data?.profile) {
    const msg = (data && typeof data.error === 'string' && data.error) || `ensure-profile HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.profile as EnsuredProfile;
}
