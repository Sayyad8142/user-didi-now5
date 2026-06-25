import { useEffect, useState } from 'react';
import { LOVABLE_CLOUD_FUNCTIONS_URL, PRODUCTION_ANON_KEY } from '@/lib/constants';

export type AvailabilityBucket =
  | 'very_high' | 'high' | 'medium' | 'low' | 'very_low';

export interface ForecastSlot {
  hour_of_day: number;
  total_bookings: number;
  fulfilled_bookings: number;
  failed_bookings: number;
  availability_pct: number;
  bucket: AvailabilityBucket;
}

interface State {
  data: ForecastSlot[];
  loading: boolean;
  error: string | null;
  source: 'db' | 'fallback' | null;
}

// 15-minute in-memory cache (matches edge function Cache-Control)
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; data: ForecastSlot[]; source: 'db' | 'fallback' }>();

// DB stores community as slug (e.g. "prestige-high-fields"); profile may carry
// the display name ("Prestige High Fields"). Normalize before querying.
function slugifyCommunity(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function useAvailabilityForecast(community: string | undefined | null, service: 'maid' | 'bathroom_cleaning') {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null, source: null });

  useEffect(() => {
    if (!community || community === 'other') {
      setState({ data: [], loading: false, error: null, source: null });
      return;
    }

    const slug = slugifyCommunity(community);
    const key = `${slug}::${service}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setState({ data: cached.data, loading: false, error: null, source: cached.source });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        console.log('[useAvailabilityForecast] fetching', { community: slug, service });
        const { data, error } = await supabase.functions.invoke('availability-forecast', {
          body: { community: slug, service },
        });
        if (cancelled) return;
        if (error) throw error;
        const forecast: ForecastSlot[] = data?.forecast ?? [];
        const source = (data?.source ?? 'fallback') as 'db' | 'fallback';
        cache.set(key, { at: Date.now(), data: forecast, source });
        setState({ data: forecast, loading: false, error: null, source });
      } catch (e: any) {
        if (cancelled) return;
        console.error('[useAvailabilityForecast]', e?.message || e);
        setState({ data: [], loading: false, error: e?.message || 'Failed to load forecast', source: null });
      }
    })();

    return () => { cancelled = true; };
  }, [community, service]);

  return state;
}
