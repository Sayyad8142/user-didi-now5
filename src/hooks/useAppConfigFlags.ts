import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches admin-controlled feature flags from app_config.
 * Cached for the session; safe defaults if missing/null.
 */
export function usePayAfterServiceEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['app_config', 'enable_pay_after_service'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('enable_pay_after_service' as any)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[appConfig] failed to read enable_pay_after_service', error);
        return false;
      }
      return (data as any)?.enable_pay_after_service === true;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
  // Safe default: hidden
  return data === true;
}
