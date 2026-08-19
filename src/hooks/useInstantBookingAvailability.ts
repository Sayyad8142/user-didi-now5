/**
 * Hook to check if instant booking is available for a service type.
 * Returns unavailable when 0 workers are online now for the given service.
 */
import { useOnlineWorkerCounts } from './useOnlineWorkerCounts';

export function useInstantBookingAvailability(serviceType: string | undefined) {
  const { counts, loading, isServiceAvailable } = useOnlineWorkerCounts();

  if (!serviceType) {
    return { isAvailable: false, activeCount: 0, isLoading: loading, isError: false };
  }

  const available = isServiceAvailable(serviceType);
  const activeCount = counts[serviceType] ?? 0;

  return {
    isAvailable: available,
    activeCount,
    isLoading: loading,
    isError: false,
  };
}
