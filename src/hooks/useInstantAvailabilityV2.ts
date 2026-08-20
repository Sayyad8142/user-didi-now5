import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';

export type AvailabilityReason = 'AVAILABLE' | 'CLOSED' | 'BUSY' | 'NO_SUPPLY' | 'ERROR' | 'MISSING_INPUTS';

export interface InstantAvailabilityResult {
  available: boolean;
  reason: AvailabilityReason;
  message: string;
  eligible_worker_count?: number;
  pending_count?: number;
  limit?: number;
}

/**
 * Hook to check if instant booking is available for a service type.
 * Consumes the unified backend availability source of truth.
 */
export function useInstantBookingAvailability(serviceType: string | undefined, community: string | undefined) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['instant-availability', serviceType, community],
    enabled: !!serviceType && !!community,
    refetchInterval: 30_000, // Refetch every 30s
    staleTime: 15_000,
    queryFn: async (): Promise<InstantAvailabilityResult> => {
      // Call the Lovable Cloud function directly to avoid routing through
      // external custom domains that may not have the function registered.
      const res = await fetch(`${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/check-instant-availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': PRODUCTION_ANON_KEY,
          'Authorization': `Bearer ${PRODUCTION_ANON_KEY}`
        },
        body: JSON.stringify({ service: serviceType, community })
      });
      
      if (!res.ok) {
        console.error('[useInstantBookingAvailability] API error:', res.status);
        throw new Error(`Availability API failed with ${res.status}`);
      }
      
      const data = await res.json();
      return data as InstantAvailabilityResult;
      
      return data as InstantAvailabilityResult;
    }
  });

  return {
    isAvailable: data?.available ?? false,
    reason: data?.reason ?? 'ERROR',
    message: data?.message ?? 'Checking availability...',
    activeCount: data?.eligible_worker_count ?? 0,
    isLoading: isLoading,
    isError: !!error,
    data,
    refetch
  };
}
