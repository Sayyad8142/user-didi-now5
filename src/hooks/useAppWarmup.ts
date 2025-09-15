import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

// Simple warmup without complex imports to avoid circular dependencies
export function useAppWarmup() {
  useEffect(() => {
    let cancelled = false;

    const warmup = async () => {
      try {
        // Ensure auth session is hydrated quickly
        await supabase.auth.getSession();

        // Simple preloads without complex queries
        const routePreloads = [
          import('@/pages/Bookings').catch(() => null),
          import('@/pages/Profile').catch(() => null),
          import('@/pages/FAQs').catch(() => null),
          import('@/pages/LiveChat').catch(() => null),
        ];

        await Promise.allSettled(routePreloads);
      } catch (error) {
        console.warn('Warmup failed:', error);
      }
    };

    warmup();
    return () => { cancelled = true; };
  }, []);
}