import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const MAX_PENDING_INSTANT = 3;

/**
 * Reusable hook: checks if instant booking supply is full for a community.
 * Only counts bookings with status = 'pending' (not dispatched/accepted/assigned).
 * Refetches every 15s for near-realtime accuracy.
 */
export function useSupplyCheck(communityId: string | undefined) {
  const { data: pendingCount, isLoading, refetch } = useQuery({
    queryKey: ["supply-check", communityId],
    enabled: !!communityId,
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_instant_supply", {
        p_community: communityId!,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });

  const isSupplyFull = !isLoading && (pendingCount ?? 0) >= MAX_PENDING_INSTANT;

  return {
    pendingCount: pendingCount ?? 0,
    isSupplyFull,
    isLoading,
    refetch,
    maxAllowed: MAX_PENDING_INSTANT,
  };
}

/**
 * Standalone function for server-side validation before booking insert.
 * Returns true if supply is available, false if full.
 */
export async function checkInstantBookingAvailability(communityId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_instant_supply", {
    p_community: communityId,
  });
  if (error) {
    console.error("Supply check error:", error);
    return true; // fail-open to not block bookings on error
  }
  return (data as number) < MAX_PENDING_INSTANT;
}
