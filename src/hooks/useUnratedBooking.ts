/**
 * Hook to check if the authenticated user has a completed booking
 * that hasn't been rated yet. Only considers bookings completed
 * AFTER the mandatory rating feature rollout date.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';

// Rollout date: only bookings completed after this date require mandatory rating.
// Set to the deployment date of this feature.
export const MANDATORY_RATING_ROLLOUT = '2025-07-11T00:00:00Z';

export interface UnratedBooking {
  id: string;
  service_type: string;
  worker_id: string | null;
  worker_name: string | null;
  worker_photo_url: string | null;
  completed_at: string | null;
  created_at: string;
  community: string;
  flat_no: string;
  price_inr: number | null;
}

export function useUnratedBooking() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unrated-booking', profile?.id],
    enabled: !!profile?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<UnratedBooking | null> => {
      if (!profile?.id) return null;

      // Get completed bookings after rollout that have NO rating in worker_ratings
      const { data: completedBookings, error: bookingsErr } = await supabase
        .from('bookings')
        .select('id, service_type, worker_id, worker_name, worker_photo_url, completed_at, created_at, community, flat_no, price_inr')
        .eq('user_id', profile.id)
        .eq('status', 'completed')
        .gte('completed_at', MANDATORY_RATING_ROLLOUT)
        .order('completed_at', { ascending: false })
        .limit(10);

      if (bookingsErr || !completedBookings?.length) return null;

      // Check which of these have ratings
      const bookingIds = completedBookings.map(b => b.id);
      const { data: ratings } = await supabase
        .from('worker_ratings')
        .select('booking_id')
        .in('booking_id', bookingIds);

      const ratedBookingIds = new Set((ratings || []).map(r => r.booking_id));

      // Return the most recent unrated booking
      const unrated = completedBookings.find(b => !ratedBookingIds.has(b.id));
      return unrated || null;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['unrated-booking', profile?.id] });
  };

  return {
    unratedBooking: query.data ?? null,
    isLoading: query.isLoading,
    hasUnratedBooking: !!query.data,
    invalidate,
  };
}
