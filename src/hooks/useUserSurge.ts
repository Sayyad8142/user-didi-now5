import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/contexts/ProfileContext';
import { computeUserSurge, type SurgeResult } from '@/lib/userSurge';
import { fetchUserSurge } from '@/lib/surgeApi';

export const USER_SURGE_QUERY_KEY = 'user_surge';

/**
 * Returns the current user's loyalty surge.
 *
 * The value is fetched from the `get-user-surge` edge function, which is the
 * SAME source the payment validators (create-razorpay-order /
 * create-paid-booking) use. Reading booking counts directly from the client is
 * impossible — anon access to `bookings` is denied on production (42501) — and
 * silently produced ₹0 for everyone, which made every payment for a
 * loyalty-tier user fail with "Price has changed. Please refresh and try again."
 *
 * `authoritative` is false while loading or when the fetch failed; callers must
 * not initiate a payment with a non-authoritative quote.
 */
export function useUserSurge(): {
  surge: SurgeResult;
  loading: boolean;
  authoritative: boolean;
  refresh: () => Promise<void>;
} {
  const { profile } = useProfile();
  const profileId = profile?.id ?? null;
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: [USER_SURGE_QUERY_KEY, profileId],
    enabled: !!profileId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    queryFn: fetchUserSurge,
  });

  // Guests have no loyalty history → base price, and that IS authoritative.
  if (!profileId) {
    return {
      surge: computeUserSurge(0),
      loading: false,
      authoritative: true,
      refresh: async () => {},
    };
  }

  const base = computeUserSurge(data?.completed_count ?? 0);
  const serverAmount = data ? data.surge_amount : 0;

  return {
    // Server amount always wins over the locally derived tier amount.
    surge: { ...base, amount: data ? serverAmount : 0 },
    loading: isLoading,
    authoritative: !!data && !isError,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: [USER_SURGE_QUERY_KEY, profileId] });
      await queryClient.refetchQueries({ queryKey: [USER_SURGE_QUERY_KEY, profileId] });
    },
  };
}
