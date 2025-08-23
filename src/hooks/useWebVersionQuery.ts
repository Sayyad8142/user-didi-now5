import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useWebVersionQuery() {
  return useQuery({
    queryKey: ['web-version'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ops_settings')
        .select('value')
        .eq('key', 'web_version')
        .single();

      if (error) {
        console.error('Failed to fetch web version:', error);
        return '1.0.0'; // fallback
      }

      return data?.value || '1.0.0';
    },
    staleTime: 60 * 1000, // 60 seconds
    refetchInterval: 60 * 1000, // Refetch every 60 seconds
    retry: 1,
  });
}