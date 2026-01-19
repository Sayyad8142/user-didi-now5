/**
 * Hook to check if instant booking is available for a service type.
 * Currently always returns available (no limit).
 */
export function useInstantBookingAvailability(_serviceType: string | undefined) {
  return {
    isAvailable: true,
    activeCount: 0,
    isLoading: false,
    isError: false,
  };
}
