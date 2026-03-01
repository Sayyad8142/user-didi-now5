import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  return useQuery({
    queryKey: ['favorite-workers', serviceType, community],
    enabled: !!serviceType && !!community,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_favorite_workers', {
        p_service: serviceType!,
        p_community: community!,
      });
      if (error) throw error;
      return (data || []) as FavoriteWorker[];
    },
  });
}
