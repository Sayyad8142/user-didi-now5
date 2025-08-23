import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Community {
  id: string;
  name: string;
  value: string;
  is_active: boolean;
}

export function useCommunities() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCommunities = async () => {
    try {
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

      setCommunities(data || []);
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

  return { communities, loading, error, refresh: fetchCommunities };
}