import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Community {
  id: string;
  name: string;
  value: string;
  is_active: boolean;
  flat_format?: string;
}

const COMMUNITIES_KEY = ['communities', 'active'] as const;

async function fetchCommunities(): Promise<Community[]> {
  const { data, error } = await supabase
    .from('communities')
    .select('id, name, value, is_active, flat_format')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data || []) as Community[];
}

export function useCommunities() {
  const query = useQuery<Community[]>({
    queryKey: COMMUNITIES_KEY,
    queryFn: fetchCommunities,
    staleTime: 24 * 60 * 60 * 1000, // 1 day
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 2,
  });

  return useMemo(() => ({
    communities: query.data || [],
    loading: query.isLoading,
    error: query.error ? 'Failed to load communities' : null,
    refresh: () => query.refetch(),
  }), [query.data, query.isLoading, query.error, query.refetch]);
}
