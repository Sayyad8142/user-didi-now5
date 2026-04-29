import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentBackendUrl } from '@/integrations/supabase/client';
import { DIRECT_SUPABASE_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';

/**
 * Fetches admin-controlled feature flags from app_config.
 * Cached for 5 minutes to avoid refetch storms on remount/focus.
 * Manual refresh: queryClient.invalidateQueries({ queryKey: ['app_config', ...] }).
 * Safe default: false (hidden).
 *
 * Hardened:
 * - Selects '*' so a missing/renamed column never silently nullifies the row.
 * - Logs the raw row + backend URL so we can confirm which DB the published
 *   app is actually reading and what the row looks like.
 */
export function usePayAfterServiceEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['app_config', 'enable_pay_after_service'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const row: any = data || {};
      const raw = row.enable_pay_after_service;
      // Be tolerant of boolean / "true" string / 1 just in case
      const enabled = raw === true || raw === 'true' || raw === 1;

      console.log('[PayAfterServiceFlag]', {
        backendUrl: getCurrentBackendUrl(),
        enabled,
        rawValue: raw,
        rowId: row?.id,
        rowUpdatedAt: row?.updated_at,
        error,
      });

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
