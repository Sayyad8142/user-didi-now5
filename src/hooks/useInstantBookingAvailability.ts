/**
 * Hook to check if instant booking is available for a service type.
 * Returns unavailable when 0 workers are online now for the given service.
 */
import { useOnlineWorkerCounts } from './useOnlineWorkerCounts';

export function useInstantBookingAvailability(serviceType: string | undefined) {
  const { counts, loading, isServiceAvailable } = useOnlineWorkerCounts();

  if (!serviceType) {
    return { 
      isAvailable: false, 
      activeCount: 0, 
      freshCount: 0,
      availabilityStatus: 'unavailable',
      isLoading: loading, 
      isError: false 
    };
  }

  const serviceCounts = counts[serviceType];
  const freshCount = serviceCounts?.online ?? 0;
  const candidateCount = serviceCounts?.candidates ?? 0;
  
  // Logic: 
  // 1. Fresh: heartbeat < 3 mins
  // 2. Candidate: heartbeat 3-30 mins
  
  let status: 'available' | 'limited_10_15' | 'limited_15_20' | 'unavailable' = 'unavailable';
  
  if (freshCount > 0) {
    status = 'available';
  } else if (candidateCount > 0) {
    // If we have candidates but no fresh workers, we look at the most recent heartbeat
    // (Note: The RPC doesn't currently return the exact max heartbeat, so we use a safe "limited" label)
    status = 'limited_10_15'; 
  }

  return {
    isAvailable: candidateCount > 0,
    activeCount: candidateCount,
    freshCount: freshCount,
    availabilityStatus: status,
    isLoading: loading,
    isError: false,
  };
}
