import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LOVABLE_CLOUD_FUNCTIONS_URL } from '@/lib/constants';

interface Community {
  id: string;
  name: string;
  value: string;
  is_active: boolean;
  flat_format?: string;
}

const COMMUNITIES_KEY = ['communities', 'active'] as const;

/**
 * The shared supabase client points at the EXTERNAL database project, while
 * edge functions live on Lovable Cloud. So we must call the function URL
 * directly instead of supabase.functions.invoke().
 */
async function fetchViaEdge(): Promise<Community[]> {
  const res = await fetch(`${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/list-communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => null);
  const list = (json as any)?.communities;
  if (!res.ok || !Array.isArray(list)) {
    throw new Error((json as any)?.error || 'Invalid communities response');
  }
  return list as Community[];
}


async function fetchCommunities(): Promise<Community[]> {
  // Primary: direct table read (works when RLS allows anon/authenticated reads)
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('id, name, value, is_active, flat_format')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    if (data && data.length > 0) return data as Community[];
  } catch (err) {
    console.warn('[useCommunities] direct read failed, using edge fallback', err);
  }

  // Fallback: service-role edge proxy (immune to RLS/function-permission issues)
  return await fetchViaEdge();
}

export function useCommunities() {
  const query = useQuery<Community[]>({
    queryKey: COMMUNITIES_KEY,
    queryFn: fetchCommunities,
    staleTime: 5 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });

  return useMemo(() => ({
    communities: query.data || [],
    loading: query.isLoading,
    error: query.error ? 'Failed to load communities' : null,
    refresh: () => query.refetch(),
  }), [query.data, query.isLoading, query.error, query.refetch]);
}
