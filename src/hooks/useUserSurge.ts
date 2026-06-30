import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { computeUserSurge, LOYALTY_SURGE_LAUNCH_DATE, type SurgeResult } from '@/lib/userSurge';

/**
 * Returns the current user's loyalty surge based on how many
 * non-cancelled bookings they have placed so far.
 *
 * Guests (no profile) → ₹0 surge (treated as 1st booking).
 * Cached 60s. Invalidate `['user_surge', profileId]` after a new booking.
 */
export function useUserSurge(): { surge: SurgeResult; loading: boolean } {
  const { profile } = useProfile();
  const profileId = profile?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['user_surge', profileId],
    enabled: !!profileId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profileId!)
        .eq('status', 'completed')
        .gte('created_at', LOYALTY_SURGE_LAUNCH_DATE);

      if (error) {
        console.warn('[useUserSurge] count error → defaulting to 0', error);
        return 0;
      }
      return count ?? 0;
    },
  });

  const completedCount = profileId ? data ?? 0 : 0;
  return {
    surge: computeUserSurge(completedCount),
    loading: !!profileId && isLoading,
  };
}
