import { useCallback, useEffect, useRef, useState } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { supabase } from '@/integrations/supabase/client';

const SERVICES = ['maid', 'bathroom_cleaning'];

interface OnlineCounts {
  [service: string]: number;
}

const REFRESH_MS = 30_000;
export const AVAILABILITY_REFRESH_EVENT = 'worker-availability-refresh';

/** Ask Home to re-read availability (e.g. after booking create/cancel). */
export function requestAvailabilityRefresh() {
  window.dispatchEvent(new Event(AVAILABILITY_REFRESH_EVENT));
}

/**
 * "Available right now" counts. Single source of truth: the canonical
 * backend count get_dispatch_eligible_worker_count (backend resolves IST
 * weekday + slot). No eligibility rules live here.
 */
export function useOnlineWorkerCounts() {
  const { profile } = useProfile();
  const community = profile?.community;
  const [counts, setCounts] = useState<OnlineCounts>({});
  const [loading, setLoading] = useState(true);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (!community || community === 'other' || inflight.current) return;
    inflight.current = true;
    try {
      const results = await Promise.all(
        SERVICES.map(async (service) => {
          const { data, error } = await (supabase as any).rpc('get_dispatch_eligible_worker_count', {
            p_service: service,
            p_community: community,
            p_day: null,
            p_slot: null,
          });
          if (error) throw error;
          const n = Number(data);
          return [service, Number.isFinite(n) ? n : 0] as const;
        }),
      );
      setCounts(Object.fromEntries(results));
    } catch (e) {
      // Keep last known counts rather than falling back to different rules.
      console.error('Error loading worker availability:', e);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [community]);

  useEffect(() => {
    if (!community) { setLoading(true); return; }
    if (community === 'other') { setCounts({}); setLoading(false); return; }

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { load(); start(); } else stop();
    };

    load();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', load);
    window.addEventListener(AVAILABILITY_REFRESH_EVENT, load);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', load);
      window.removeEventListener(AVAILABILITY_REFRESH_EVENT, load);
    };
  }, [community, load]);

  const isServiceAvailable = (service: string) => (counts[service] ?? 0) > 0;

  return { counts, loading, isServiceAvailable, refresh: load };
}
