import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { isOpenNow } from '@/features/home/time';

interface OnlineCounts {
  [service: string]: number;
}

export function useOnlineWorkerCounts() {
  const { profile } = useProfile();
  const [counts, setCounts] = useState<OnlineCounts>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const community = profile?.community;
    if (!community || community === 'other' || !isOpenNow()) {
      setCounts({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_online_workers_count', {
          p_community: community,
        });
        if (error) throw error;
        if (cancelled) return;

        const result: OnlineCounts = {};
        (data || []).forEach((row: any) => {
          result[row.service] = Number(row.online_count);
        });
        setCounts(result);
      } catch (e) {
        console.error('Error loading online worker counts:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profile?.community]);

  const isServiceAvailable = (service: string) => (counts[service] ?? 0) > 0;

  return { counts, loading, isServiceAvailable };
}
