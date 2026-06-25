import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/contexts/ProfileContext';
import {
  useAvailabilityForecast,
  type ForecastSlot,
} from '@/hooks/useAvailabilityForecast';

type Tier = 'best' | 'good' | 'low';

function tierFor(slot: ForecastSlot): Tier {
  if (slot.availability_pct >= 60) return 'best';
  if (slot.availability_pct >= 40) return 'good';
  return 'low';
}

function formatHour(h: number) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${suffix}`;
}

function buildBands(slots: ForecastSlot[]) {
  const bands: { tier: Tier; start: number; end: number }[] = [];
  if (!slots.length) return bands;
  let curTier = tierFor(slots[0]);
  let curStart = slots[0].hour_of_day;
  let prevHour = slots[0].hour_of_day;
  for (let i = 1; i < slots.length; i++) {
    const t = tierFor(slots[i]);
    const h = slots[i].hour_of_day;
    if (t === curTier && h === prevHour + 1) {
      prevHour = h;
      continue;
    }
    bands.push({ tier: curTier, start: curStart, end: prevHour + 1 });
    curTier = t;
    curStart = h;
    prevHour = h;
  }
  bands.push({ tier: curTier, start: curStart, end: prevHour + 1 });
  return bands;
}

function pickLongest(bands: { tier: Tier; start: number; end: number }[], tier: Tier) {
  return (
    bands
      .filter((b) => b.tier === tier)
      .sort((a, b) => b.end - b.start - (a.end - a.start))[0] || null
  );
}

const TIER_META: Record<Tier, { dot: string; label: string; text: string }> = {
  best: { dot: 'bg-emerald-500', label: 'Best', text: 'text-emerald-700' },
  good: { dot: 'bg-amber-400', label: 'Good', text: 'text-amber-700' },
  low: { dot: 'bg-rose-500', label: 'Low', text: 'text-rose-600' },
};

function Row({
  tier,
  band,
}: {
  tier: Tier;
  band: { start: number; end: number } | null;
}) {
  if (!band) return null;
  const meta = TIER_META[tier];
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
        <span className={cn('text-[11px] font-semibold w-9', meta.text)}>
          {meta.label}
        </span>
        <span className="text-xs font-medium text-foreground truncate">
          {formatHour(band.start)} – {formatHour(band.end)}
        </span>
      </div>
    </div>
  );
}

export function BestTimeCard() {
  const { profile } = useProfile();
  const hasCommunity = !!profile?.community && profile.community !== 'other';
  const { data: forecast, loading } = useAvailabilityForecast(
    profile?.community,
    'maid',
  );

  const bands = useMemo(() => {
    const all = buildBands(forecast);
    return {
      best: pickLongest(all, 'best'),
      good: pickLongest(all, 'good'),
      low: pickLongest(all, 'low'),
    };
  }, [forecast]);

  if (!hasCommunity) return null;
  if (!loading && forecast.length === 0) return null;

  return (
    <Card className="border border-border/50 bg-white rounded-2xl shadow-sm">
      <CardContent className="p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-bold text-foreground">
            Best time to book today
          </h4>
        </div>

        {loading ? (
          <div className="space-y-1.5">
            <div className="h-4 rounded bg-muted/40 animate-pulse" />
            <div className="h-4 rounded bg-muted/40 animate-pulse" />
            <div className="h-4 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Row tier="best" band={bands.best} />
            <Row tier="good" band={bands.good} />
            <Row tier="low" band={bands.low} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
