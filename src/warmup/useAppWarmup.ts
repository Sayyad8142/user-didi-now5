import { useEffect } from 'react';
import { queryClient } from '@/main';
import { supabase } from '@/integrations/supabase/client';

// Minimal field selects – keep them small/fast
async function fetchProfile() {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, phone, community')
    .single();
  if (error) throw error;
  return data;
}

async function fetchCommunities() {
  const { data, error } = await supabase.from('communities')
    .select('id, name, value').limit(100);
  if (error) throw error;
  return data;
}

async function fetchMyBookings() {
  const { data, error } = await supabase.from('bookings')
    .select('id,status,service_type,price_inr,scheduled_time,created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

export function useAppWarmup() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Ensure auth session is hydrated quickly
      await supabase.auth.getSession();

      // 1) Prefetch core queries in parallel
      const prefetches = [
        queryClient.prefetchQuery({ queryKey: ['profile'], queryFn: fetchProfile }),
        queryClient.prefetchQuery({ queryKey: ['communities'], queryFn: fetchCommunities }),
        queryClient.prefetchQuery({ queryKey: ['bookings'], queryFn: fetchMyBookings }),
      ];

      // 2) Preload heavy route bundles (replace with your actual paths)
      const routeChunkPreloads = [
        import('@/pages/Bookings'),      // first tab/detail screens
        import('@/pages/Profile'),
        import('@/pages/FAQs'),
        import('@/pages/LiveChat'),
      ];

      await Promise.allSettled([...prefetches, ...routeChunkPreloads]);

      if (cancelled) return;
      // Optionally: open a cheap realtime channel to warm the socket (optional)
      // supabase.channel('warmup').subscribe(); // uncomment if you want
    })();

    return () => { cancelled = true; };
  }, []);
}
