import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      const { data, error } = await supabase.functions.invoke('check-instant-availability', {
        body: { service: serviceType, community }
      });
      
      if (error) {
        console.error('[useInstantBookingAvailability] RPC error:', error);
        throw error;
      }
      
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
