import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Community {
  id: string;
  name: string;
  value: string;
  is_active: boolean;
}

// Cache communities for 5 minutes to avoid repeated fetches
let communitiesCache: Community[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useCommunities() {
  const [communities, setCommunities] = useState<Community[]>(communitiesCache || []);
  const [loading, setLoading] = useState(!communitiesCache);
  const [error, setError] = useState<string | null>(null);

  const fetchCommunities = async (useCache = true) => {
    try {
      // Use cache if available and not expired
      if (useCache && communitiesCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
        setCommunities(communitiesCache);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('communities')
        .select('id, name, value, is_active')
        .eq('is_active', true)
        .order('name');

      if (fetchError) {
        console.error('Error fetching communities:', fetchError);
        setError('Failed to load communities');
        return;
      }

      const communityData = data || [];
      
      // Update cache
      communitiesCache = communityData;
      cacheTimestamp = Date.now();
      
      setCommunities(communityData);
    } catch (err) {
      console.error('Error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommunities();
  }, []);

  const refresh = () => {
    fetchCommunities(false); // Force refresh, ignore cache
  };

  return { communities, loading, error, refresh };
}