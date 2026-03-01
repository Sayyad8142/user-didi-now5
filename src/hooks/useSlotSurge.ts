import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SurgeMap = Record<string, number>; // "HH:MM:SS" -> surge_amount

export function useSlotSurge(communityId: string | null | undefined, serviceKey = 'maid') {
  const [surgeMap, setSurgeMap] = useState<SurgeMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!communityId) {
      setSurgeMap({});
      return;
    }

    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('slot_surge_pricing')
        .select('slot_time, surge_amount')
        .eq('community_id', communityId)
        .eq('service_key', serviceKey)
        .eq('is_active', true);

      if (!cancelled) {
        if (error || !data) {
          console.error('Surge fetch error:', error);
          setSurgeMap({});
        } else {
          const map: SurgeMap = {};
          for (const row of data) {
            map[row.slot_time] = row.surge_amount;
          }
          setSurgeMap(map);
        }
        setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [communityId, serviceKey]);

  /** Get surge for a slot time like "17:00" or "17:00:00" */
  const getSurge = (slotTime: string): number => {
    const normalized = slotTime.includes(':') && slotTime.split(':').length === 2
      ? slotTime + ':00'
      : slotTime;
    return surgeMap[normalized] ?? 0;
  };

  return { surgeMap, getSurge, loading };
}
