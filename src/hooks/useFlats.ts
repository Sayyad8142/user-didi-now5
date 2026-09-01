import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Flat {
  id: string;
  building_id: string | null;
  community_id: string;
  flat_no: string;
  display_name?: string | null;
}

const SELECT = 'id, building_id, community_id, flat_no, display_name';

/**
 * @param communityScopedOnly true for PHF-code apartments AND villa communities:
 *        units live directly under the community with building_id IS NULL.
 */
export function useFlats(
  buildingId: string | null,
  communityId: string | null,
  communityScopedOnly: boolean = false
) {
  const [flats, setFlats] = useState<Flat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlats = useCallback(async () => {
    if (!communityId) {
      setFlats([]);
      return;
    }

    // Community-scoped units (PHF codes / villas): building_id is null
    if (communityScopedOnly) {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('flats')
          .select(SELECT)
          .eq('community_id', communityId)
          .is('building_id', null)
          .order('flat_no');

        if (fetchError) {
          console.error('Error fetching flats:', fetchError);
          setError('Failed to load flats');
          return;
        }

        setFlats((data as Flat[]) || []);
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
        .select(SELECT)
        .eq('building_id', buildingId)
        .order('flat_no');

      if (fetchError) {
        console.error('Error fetching flats:', fetchError);
        setError('Failed to load flats');
        return;
      }

      setFlats((data as Flat[]) || []);
    } catch (err) {
      console.error('Error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [buildingId, communityId, communityScopedOnly]);

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
