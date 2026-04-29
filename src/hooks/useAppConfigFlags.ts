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
      // Read directly from Supabase (bypass any custom-domain proxy that may
      // strip unknown columns or serve cached responses). This flag is a public
      // read-only feature flag, so the anon key is sufficient.
      let raw: any = undefined;
      let rowId: string | undefined;
      let rowUpdatedAt: string | undefined;
      let source = 'direct';
      let fetchError: any = null;

      try {
        const res = await fetch(
          `${DIRECT_SUPABASE_URL}/rest/v1/app_config?select=*&order=updated_at.desc&limit=1`,
          {
            headers: {
              apikey: PRODUCTION_ANON_KEY,
              Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
              'Cache-Control': 'no-cache',
            },
          },
        );
        if (res.ok) {
          const rows = await res.json();
          const row = Array.isArray(rows) && rows[0] ? rows[0] : {};
          raw = row.enable_pay_after_service;
          rowId = row.id;
          rowUpdatedAt = row.updated_at;
        } else {
          fetchError = `HTTP ${res.status}`;
        }
      } catch (e) {
        fetchError = e;
      }

      // Fallback to the proxied client if direct read failed
      if (raw === undefined) {
        source = 'proxy';
        const { data: proxyData, error: proxyError } = await supabase
          .from('app_config')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const row: any = proxyData || {};
        raw = row.enable_pay_after_service;
        rowId = row?.id;
        rowUpdatedAt = row?.updated_at;
        if (proxyError) fetchError = proxyError;
      }

      const enabled = raw === true || raw === 'true' || raw === 1;

      console.log('[PayAfterServiceFlag]', {
        source,
        backendUrl: getCurrentBackendUrl(),
        directUrl: DIRECT_SUPABASE_URL,
        enabled,
        rawValue: raw,
        rowId,
        rowUpdatedAt,
        fetchError,
      });

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
