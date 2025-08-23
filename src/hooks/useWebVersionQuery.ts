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
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch web version:', error);
        return '1.0.0'; // fallback
      }

      return data?.value || '1.0.0';
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh
    refetchInterval: 10 * 60 * 1000, // Check every 10 minutes
    retry: 1,
    refetchOnWindowFocus: false, // Don't refetch on window focus to improve performance
  });
}