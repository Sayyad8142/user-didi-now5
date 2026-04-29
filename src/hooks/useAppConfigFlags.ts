import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches admin-controlled feature flags from app_config.
 * Cached for 5 minutes to avoid refetch storms on remount/focus.
 * Manual refresh: queryClient.invalidateQueries({ queryKey: ['app_config', ...] }).
 * Safe default: false (hidden).
 */
export function usePayAfterServiceEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['app_config', 'enable_pay_after_service'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('enable_pay_after_service, updated_at' as any)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const enabled = (data as any)?.enable_pay_after_service === true;
      console.log('[PayAfterServiceFlag]', { enabled, error });

      if (error) return false;
      return enabled;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
  return data === true;
}

