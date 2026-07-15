import { useMemo } from 'react';
import { useSlotSurge, type SurgeMap } from './useSlotSurge';
import { useNow } from './useNow';

/**
 * Round the current local (IST on-device) time DOWN to the largest configured
 * surge slot ≤ now, and return that slot's surge amount.
 *
 * Instant bookings use this so the "current slot" pricing is applied the same
 * way scheduled bookings apply a picked slot. The server trigger is still the
 * source of truth — this is only for display + payload.
 */
function findCurrentSlot(surgeMap: SurgeMap, nowMs: number): { time: string | null; amount: number } {
  const keys = Object.keys(surgeMap);
  if (keys.length === 0) return { time: null, amount: 0 };
  const d = new Date(nowMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const nowKey = `${hh}:${mm}:00`;

  // Find largest slot_time <= nowKey
  let best: string | null = null;
  for (const k of keys) {
    if (k <= nowKey && (best === null || k > best)) best = k;
  }
  if (!best) return { time: null, amount: 0 };
  return { time: best, amount: surgeMap[best] ?? 0 };
}

export function useCurrentSlotSurge(
  communityId: string | null | undefined,
  serviceKey = 'maid',
) {
  const { surgeMap, loading } = useSlotSurge(communityId, serviceKey);
  const now = useNow(60_000); // recompute each minute so slot transitions apply live

  const { time, amount } = useMemo(
    () => findCurrentSlot(surgeMap, now),
    [surgeMap, now],
  );

  const reason =
    amount > 0 ? 'peak_hour' : amount < 0 ? 'off_peak_discount' : null;

  return {
    /** slot_time key like "17:00:00" that matched, or null */
    slotTime: time,
    /** surge in ₹ (positive = surcharge, negative = discount, 0 = base) */
    amount,
    /** UI label for the current pricing state */
    label:
      amount > 0
        ? 'Peak Hour'
        : amount < 0
        ? 'Current Discount'
        : null,
    reason,
    loading,
  };
}
