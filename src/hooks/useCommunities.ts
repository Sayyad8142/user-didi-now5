import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LOVABLE_CLOUD_FUNCTIONS_URL } from '@/lib/constants';
import { normalizeCommunityType, type CommunityType } from '@/lib/address';

interface Community {
  id: string;
  name: string;
  value: string;
  is_active: boolean;
  flat_format?: string;
  /** 'apartment' | 'villa' — always normalised, defaults to 'apartment'. */
  community_type: CommunityType;
}

/**
 * QA-only escape hatch: append ?qa_inactive=1 once (or set the localStorage
 * flag) to also list inactive communities so the QA Villa Test Community can be
 * exercised before onboarding a real villa community.
 */
function qaIncludeInactive(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('qa_inactive') === '1') {
      localStorage.setItem('qa_include_inactive', '1');
    }
    return localStorage.getItem('qa_include_inactive') === '1';
  } catch {
    return false;
  }
}

const COMMUNITIES_KEY = ['communities', 'active'] as const;


const normalizeList = (rows: any[]): Community[] =>
  rows.map(r => ({
    ...r,
    community_type: normalizeCommunityType(r?.community_type),
  })) as Community[];

/**
 * The shared supabase client points at the EXTERNAL database project, while
 * edge functions live on Lovable Cloud. So we must call the function URL
 * directly instead of supabase.functions.invoke().
 */
async function fetchViaEdge(includeInactive = false): Promise<Community[]> {
  const res = await fetch(`${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/list-communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_inactive: includeInactive }),
  });
  const json = await res.json().catch(() => null);
  const list = (json as any)?.communities;
  if (!res.ok || !Array.isArray(list)) {
    throw new Error((json as any)?.error || 'Invalid communities response');
  }
  return normalizeList(list);
}


async function fetchCommunities(): Promise<Community[]> {
  // QA path: inactive communities are only reachable through the service-role proxy
  if (qaIncludeInactive()) return await fetchViaEdge(true);

  // Primary: direct table read (works when RLS allows anon/authenticated reads)
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('id, name, value, is_active, flat_format, community_type')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    if (data && data.length > 0) return normalizeList(data as any[]);
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
