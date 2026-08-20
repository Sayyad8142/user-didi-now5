import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LOVABLE_CLOUD_FUNCTIONS_URL } from '@/lib/constants';

export type SurgeMap = Record<string, number>; // "HH:MM" and "HH:MM:SS" -> surge_amount

interface SurgeRow {
  slot_time: string;
  surge_amount: number;
}

/** Store both "HH:MM" and "HH:MM:SS" keys so any slot format matches. */
function buildMap(rows: SurgeRow[]): SurgeMap {
  const map: SurgeMap = {};
  for (const row of rows) {
    if (!row?.slot_time) continue;
    const hhmm = row.slot_time.slice(0, 5);
    const amount = Number(row.surge_amount ?? 0);
    map[hhmm] = amount;
    map[`${hhmm}:00`] = amount;
  }
  return map;
}

/**
 * The shared supabase client targets the EXTERNAL database, whose RLS policy on
 * slot_surge_pricing calls is_admin() — a function anon cannot execute. When the
 * direct read fails we fall back to the service-role edge proxy on Lovable Cloud.
 */
async function fetchViaEdge(communityId: string, serviceKey: string): Promise<SurgeRow[]> {
  const res = await fetch(`${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/list-slot-surge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ community_id: communityId, service_key: serviceKey }),
  });
  const json = await res.json().catch(() => null);
  const list = (json as any)?.slots;
  if (!res.ok || !Array.isArray(list)) {
    throw new Error((json as any)?.error || 'Invalid slot surge response');
  }
  return list as SurgeRow[];
}

export function useSlotSurge(communityId: string | null | undefined, serviceKey = 'maid') {
  const [surgeMap, setSurgeMap] = useState<SurgeMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!communityId) {
      setSurgeMap({});
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      let rows: SurgeRow[] | null = null;

      try {
        const { data, error } = await supabase
          .from('slot_surge_pricing')
          .select('slot_time, surge_amount')
          .eq('community_id', communityId)
          .eq('service_key', serviceKey)
          .eq('is_active', true);
        if (error) throw error;
        if (data && data.length > 0) rows = data as SurgeRow[];
      } catch (err) {
        console.warn('[useSlotSurge] direct read failed, using edge fallback', err);
      }

      if (!rows) {
        try {
          rows = await fetchViaEdge(communityId, serviceKey);
        } catch (err) {
          console.error('[useSlotSurge] edge fallback failed', err);
          rows = [];
        }
      }

      if (!cancelled) {
        setSurgeMap(buildMap(rows));
        setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [communityId, serviceKey]);

  /** Get surge for a slot time like "17:00" or "17:00:00" */
  const getSurge = (slotTime: string): number => {
    if (!slotTime) return 0;
    const hhmm = slotTime.slice(0, 5);
    return surgeMap[hhmm] ?? surgeMap[`${hhmm}:00`] ?? 0;
  };

  return { surgeMap, getSurge, loading };
}
