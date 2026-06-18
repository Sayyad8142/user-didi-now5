import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { getLoyaltyInfo, applyLoyalty, type LoyaltyInfo } from '@/features/booking/loyalty';

/**
 * Reads profiles.completed_bookings_count for the current user and
 * returns derived loyalty info. Cheap, cached, refetches on focus.
 */
export function useLoyalty() {
  const { profile } = useProfile();
  const userId = profile?.id ?? null;

  const query = useQuery({
    queryKey: ['loyalty-count', userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { data, error } = await supabase
        .from('profiles')
        .select('completed_bookings_count')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        console.warn('[useLoyalty] fetch failed:', error.message);
        return 0;
      }
      return Number((data as any)?.completed_bookings_count ?? 0);
    },
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const count = query.data ?? 0;
  const info: LoyaltyInfo = getLoyaltyInfo(count);

  return {
    count,
    info,
    isLoading: query.isLoading,
    refetch: query.refetch,
    /** Helper: compute final price for a given base. */
    apply: (basePrice: number) => applyLoyalty(basePrice, count),
  };
}
