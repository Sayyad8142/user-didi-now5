import { useCallback, useEffect, useRef, useState } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';

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
 * "Available right now" counts. Single source of truth: the backend
 * get-available-workers-now function, which reads the same eligible pool
 * the dispatcher offers bookings to. No eligibility rules live here.
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
      const res = await fetch(`${LOVABLE_CLOUD_FUNCTIONS_URL}/functions/v1/get-available-workers-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PRODUCTION_ANON_KEY,
          Authorization: `Bearer ${PRODUCTION_ANON_KEY}`,
        },
        body: JSON.stringify({ community }),
      });
      if (!res.ok) throw new Error(`availability ${res.status}`);
      const data = await res.json();
      setCounts(data.counts || {});
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
