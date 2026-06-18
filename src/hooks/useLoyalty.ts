import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { getLoyaltyInfo, applyLoyalty, type LoyaltyInfo } from '@/features/booking/loyalty';

/**
 * Reads profiles.completed_bookings_count for the current user.
 *
 * SAFETY: returns `count = null` when the column is missing, value is
 * NULL, or the lookup fails. The downstream `LoyaltyInfo` will then
 * have `available = false` → no discount, no surcharge.
 */
export function useLoyalty() {
  const { profile } = useProfile();
  const userId = profile?.id ?? null;

  const query = useQuery({
    queryKey: ['loyalty-count', userId],
    queryFn: async (): Promise<number | null> => {
      if (!userId) return null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('completed_bookings_count')
          .eq('id', userId)
          .maybeSingle();
        if (error) {
          console.warn('[loyalty_pricing_lookup_failed]', {
            user_id: userId,
            reason: error.message,
          });
          return null;
        }
        const raw = (data as any)?.completed_bookings_count;
        if (raw === null || raw === undefined) {
          console.warn('[loyalty_pricing_skipped]', {
            user_id: userId,
            reason: 'completed_bookings_count_null_or_missing',
          });
          return null;
        }
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          console.warn('[loyalty_pricing_skipped]', {
            user_id: userId,
            reason: 'completed_bookings_count_not_numeric',
            raw,
          });
          return null;
        }
        console.info('[loyalty_pricing_applied]', { user_id: userId, count: num });
        return num;
      } catch (e: any) {
        console.warn('[loyalty_pricing_lookup_failed]', {
          user_id: userId,
          reason: e?.message || String(e),
        });
        return null;
      }
    },
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const count = query.data ?? null;
  const info: LoyaltyInfo = getLoyaltyInfo(count);

  return {
    /** Numeric count when known, else null. */
    count,
    /** True only when count was successfully retrieved from DB. */
    available: info.available,
    info,
    isLoading: query.isLoading,
    refetch: query.refetch,
    /** Helper: compute final price for a given base. */
    apply: (basePrice: number) => applyLoyalty(basePrice, count),
  };
}
