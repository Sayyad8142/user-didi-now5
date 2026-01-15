import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const INSTANT_BOOKING_THRESHOLD = 5;
const POLLING_INTERVAL = 20000; // 20 seconds

interface InstantBookingAvailability {
  isAvailable: boolean;
  activeCount: number;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Hook to check if instant booking is available for a service type.
 * Returns unavailable if there are >= 5 pending/dispatched/accepted instant bookings.
 */
export function useInstantBookingAvailability(serviceType: string | undefined): InstantBookingAvailability {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['instant-booking-availability', serviceType],
    queryFn: async () => {
      if (!serviceType) return { count: 0 };
      
      const { count, error } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('booking_type', 'instant')
        .eq('service_type', serviceType)
        .in('status', ['pending', 'dispatched', 'accepted']);
      
      if (error) {
        console.error('Error checking instant booking availability:', error);
        throw error;
      }
      
      return { count: count ?? 0 };
    },
    enabled: !!serviceType,
    refetchInterval: POLLING_INTERVAL,
    staleTime: 10000, // Consider data stale after 10 seconds
    retry: 2,
  });

  // On error, default to disabling instant booking (safety first)
  if (isError) {
    return {
      isAvailable: false,
      activeCount: INSTANT_BOOKING_THRESHOLD,
      isLoading: false,
      isError: true,
    };
  }

  const activeCount = data?.count ?? 0;
  const isAvailable = activeCount < INSTANT_BOOKING_THRESHOLD;

  return {
    isAvailable,
    activeCount,
    isLoading,
    isError,
  };
}
