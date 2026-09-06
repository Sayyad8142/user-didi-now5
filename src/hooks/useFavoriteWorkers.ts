import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchFavoriteWorkersViaProxy } from '@/features/booking/favoriteWorkersClient';

export type FavoriteWorker = {
  worker_id: string;
  full_name: string;
  photo_url: string | null;
  rating_avg: number;
  rating_count: number;
  completed_bookings_count: number;
  is_online: boolean;
  last_seen_at: string | null;
  last_booking_at: string | null;
};

export function useFavoriteWorkers(serviceType?: string, community?: string) {
  const { profile } = useProfile();
  const userId = profile?.id;

  return useQuery({
    queryKey: ['favorite-workers', serviceType, community, userId],
    enabled: !!serviceType && !!community && !!userId,
    refetchInterval: 15_000,
    retry: 1,
    queryFn: async () => {
      // Direct RPC first (works only if EXECUTE is granted to anon on the DB).
      const { data, error } = await supabase.rpc('get_favorite_workers', {
        p_service: serviceType!,
        p_community: community!,
        p_user_id: userId!,
      } as any);

      if (!error) return (data || []) as FavoriteWorker[];

      // Production reality: 42501 permission denied → use the authenticated
      // service-role proxy instead of silently showing an empty list.
      console.warn('[favorite-workers] direct RPC failed, using proxy', error.code, error.message);
      return fetchFavoriteWorkersViaProxy(
        serviceType!,
        community!,
        `${error.code || ''} ${error.message}`.trim(),
      );
    },
  });
}
