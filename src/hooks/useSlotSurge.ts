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
            // Trim slot_time to ensure match regardless of :00 suffix (HH:mm)
            const key = row.slot_time.length > 5 ? row.slot_time.slice(0, 5) : row.slot_time;
            map[key] = row.surge_amount;
            // Also store the full version to be safe (HH:mm:ss)
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
    if (!slotTime) return 0;
    const hhmm = slotTime.length > 5 ? slotTime.slice(0, 5) : slotTime;
    const hhmmss = hhmm + ':00';
    return surgeMap[hhmm] ?? surgeMap[hhmmss] ?? 0;
  };

  return { surgeMap, getSurge, loading };
}
