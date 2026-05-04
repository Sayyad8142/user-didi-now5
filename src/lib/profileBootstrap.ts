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

export interface BootstrapInput {
  phone?: string | null;
  signupData?: {
    fullName?: string;
    communityValue?: string;
    communityId?: string | null;
    buildingId?: string | null;
    flatId?: string | null;
    flatNo?: string;
  } | null;
}

export async function bootstrapProfileViaEdge(
  input: BootstrapInput = {}
): Promise<BootstrappedProfile> {
  const backendUrl = await resolveBackendUrl();
  const candidateUrls = [
    `${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/bootstrap-profile`,
    ...(backendUrl ? [`${backendUrl}/functions/v1/bootstrap-profile`] : []),
  ].filter((url, index, arr) => arr.indexOf(url) === index);
  if (candidateUrls.length === 0) throw new Error("No reachable backend");

  const callOnce = async (url: string, forceRefresh: boolean) => {
    const token = await getFirebaseIdToken(forceRefresh);
    if (!token) throw new Error("Not signed in");

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: PRODUCTION_ANON_KEY,
        Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
        "x-firebase-token": token,
      },
      body: JSON.stringify({
        phone: input.phone ?? null,
        signupData: input.signupData ?? null,
      }),
    });
  };

  let lastError: Error | null = null;

  for (const url of candidateUrls) {
    try {
      let res = await callOnce(url, false);
      if (res.status === 401 || res.status === 403) {
        res = await callOnce(url, true);
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.profile) {
        const msg =
          (typeof data?.error === "string" && data.error) ||
          `Profile bootstrap failed (HTTP ${res.status})`;
        throw new Error(msg);
      }
      return data.profile as BootstrappedProfile;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || "Profile bootstrap failed");
      console.warn("[ProfileBootstrap] endpoint failed, trying fallback if available", { url, error: lastError.message });
    }
  }

  throw lastError || new Error("Profile bootstrap failed");
}
