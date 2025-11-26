import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Building {
  id: string;
  community_id: string;
  name: string;
}

export function useBuildings(communityId: string | null) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBuildings = useCallback(async () => {
    if (!communityId) {
      setBuildings([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('buildings')
        .select('id, community_id, name')
        .eq('community_id', communityId)
        .order('name');

      if (fetchError) {
        console.error('Error fetching buildings:', fetchError);
        setError('Failed to load buildings');
        return;
      }

      setBuildings(data || []);
    } catch (err) {
      console.error('Error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  const memoizedValue = useMemo(() => ({
    buildings,
    loading,
    error,
    refresh: fetchBuildings
  }), [buildings, loading, error, fetchBuildings]);

  return memoizedValue;
}
