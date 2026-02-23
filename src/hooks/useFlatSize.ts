import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';

/**
 * Fetches the flat_size from the flats table using the profile's flat_id.
 * This ensures flat_size always comes from admin-managed data, not user input.
 */
export function useFlatSize() {
  const { profile, loading: profileLoading } = useProfile();
  const [flatSize, setFlatSize] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;

    if (!profile?.flat_id) {
      setFlatSize(null);
      setLoading(false);
      setError(profile ? 'no_flat_id' : null);
      return;
    }

    let cancelled = false;

    const fetchFlatSize = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('flats')
        .select('flat_size')
        .eq('id', profile.flat_id!)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        console.error('Error fetching flat_size:', fetchError);
        setError('fetch_error');
        setLoading(false);
        return;
      }

      if (!data || !data.flat_size) {
        setFlatSize(null);
        setError('no_flat_size');
        setLoading(false);
        return;
      }

      setFlatSize(data.flat_size);
      setLoading(false);
    };

    fetchFlatSize();
    return () => { cancelled = true; };
  }, [profile?.flat_id, profileLoading]);

  return { flatSize, loading: loading || profileLoading, error };
}
