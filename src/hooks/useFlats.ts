import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Flat {
  id: string;
  building_id: string | null;
  community_id: string;
  flat_no: string;
}

export function useFlats(buildingId: string | null, communityId: string | null, isPHF: boolean = false) {
  const [flats, setFlats] = useState<Flat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlats = useCallback(async () => {
    if (!communityId) {
      setFlats([]);
      return;
    }

    // For PHF format, fetch flats by community_id only (building_id is null)
    if (isPHF) {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('flats')
          .select('id, building_id, community_id, flat_no')
          .eq('community_id', communityId)
          .is('building_id', null)
          .order('flat_no');

        if (fetchError) {
          console.error('Error fetching flats:', fetchError);
          setError('Failed to load flats');
          return;
        }

        setFlats(data || []);
      } catch (err) {
        console.error('Error:', err);
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
      return;
    }

    // For standard format, require buildingId
    if (!buildingId) {
      setFlats([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('flats')
        .select('id, building_id, community_id, flat_no')
        .eq('building_id', buildingId)
        .order('flat_no');

      if (fetchError) {
        console.error('Error fetching flats:', fetchError);
        setError('Failed to load flats');
        return;
      }

      setFlats(data || []);
    } catch (err) {
      console.error('Error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [buildingId, communityId, isPHF]);

  useEffect(() => {
    fetchFlats();
  }, [fetchFlats]);

  const memoizedValue = useMemo(() => ({
    flats,
    loading,
    error,
    refresh: fetchFlats
  }), [flats, loading, error, fetchFlats]);

  return memoizedValue;
}
