import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, TrendingUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/contexts/ProfileContext';
import { useAvailabilityForecast, type ForecastSlot, type AvailabilityBucket } from '@/hooks/useAvailabilityForecast';

type Service = 'maid' | 'bathroom_cleaning';

const SERVICE_TABS: { id: Service; label: string }[] = [
  { id: 'maid', label: 'Maids' },
  { id: 'bathroom_cleaning', label: 'Bathroom' },
];

const BUCKET_COLOR: Record<AvailabilityBucket, string> = {
  very_high: 'bg-emerald-500',
  high: 'bg-green-500',
  medium: 'bg-amber-400',
  low: 'bg-orange-500',
  very_low: 'bg-rose-500',
};

const BUCKET_LABEL: Record<AvailabilityBucket, string> = {
  very_high: 'Very High',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  very_low: 'Very Low',
};

function formatHour(h: number) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${suffix}`;
}

function buildInsight(slots: ForecastSlot[], service: Service): string | null {
  if (!slots.length) return null;
  const label = service === 'maid' ? 'Maid' : 'Bathroom Cleaner';

  // Find best contiguous window (>= high)
  const goodIdx = slots
    .map((s, i) => ({ i, ok: s.availability_pct >= 60 }))
    .filter((x) => x.ok)
    .map((x) => x.i);

  let bestRange: [number, number] | null = null;
  if (goodIdx.length) {
    let start = goodIdx[0], prev = goodIdx[0], bestLen = 0;
    let curStart = start;
    for (let k = 1; k <= goodIdx.length; k++) {
      const cur = goodIdx[k];
      if (cur === prev + 1) { prev = cur; continue; }
      const len = prev - curStart + 1;
      if (len > bestLen) { bestLen = len; bestRange = [curStart, prev]; }
      curStart = cur; prev = cur;
    }
  }

  // Find first weak hour
  const weak = slots.find((s) => s.availability_pct < 40);

  if (bestRange) {
    const a = formatHour(slots[bestRange[0]].hour_of_day);
    const b = formatHour(slots[bestRange[1]].hour_of_day + 1);
    if (weak) {
      return `Best time to book a ${label} today: ${a} – ${b}. Availability drops after ${formatHour(weak.hour_of_day)}.`;
    }
    return `Best time to book a ${label} today: ${a} – ${b}.`;
  }
  if (weak) {
    return `Worker shortage expected after ${formatHour(weak.hour_of_day)}. Try scheduling for tomorrow morning.`;
  }
  return `${label} availability looks steady throughout the day.`;
}

export function WorkerAvailabilityForecast() {
  const { profile } = useProfile();
  const [service, setService] = useState<Service>('maid');
  const { data, loading, source } = useAvailabilityForecast(profile?.community, service);

  const insight = useMemo(() => buildInsight(data, service), [data, service]);

  if (!profile?.community || profile.community === 'other') return null;

  return (
    <Card className="relative overflow-hidden border border-border/50 bg-card rounded-3xl shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight">Worker Availability Today</h3>
            <p className="text-xs text-muted-foreground">Based on the last 30 days in your society</p>
          </div>
        </div>

        {/* Service tabs */}
        <div className="flex gap-2 p-1 bg-muted/40 rounded-full mb-4">
          {SERVICE_TABS.map((t) => {
            const active = t.id === service;
            return (
              <button
                key={t.id}
                onClick={() => setService(t.id)}
                className={cn(
                  'flex-1 h-9 rounded-full text-sm font-semibold transition-all',
                  active
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Forecast graph */}
        {loading ? (
          <div className="h-32 rounded-2xl bg-muted/30 animate-pulse" />
        ) : data.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            Forecast unavailable right now.
          </div>
        ) : (
          <>
            <div className="flex items-end gap-1 h-28 px-1">
              {data.map((slot) => {
                const heightPct = Math.max(8, slot.availability_pct);
                return (
                  <div key={slot.hour_of_day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={cn(
                          'w-full rounded-t-md transition-all',
                          BUCKET_COLOR[slot.bucket]
                        )}
                        style={{ height: `${heightPct}%` }}
                        title={`${formatHour(slot.hour_of_day)} · ${BUCKET_LABEL[slot.bucket]} (${slot.availability_pct}%)`}
                      />
                    </div>
                    <span className="text-[9px] font-medium text-muted-foreground leading-none">
                      {slot.hour_of_day % 12 === 0 ? 12 : slot.hour_of_day % 12}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-[10px] text-muted-foreground">7 AM</span>
              <span className="text-[10px] text-muted-foreground">1 PM</span>
              <span className="text-[10px] text-muted-foreground">7 PM</span>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
              {(['very_high','high','medium','low','very_low'] as AvailabilityBucket[]).map((b) => (
                <div key={b} className="flex items-center gap-1.5">
                  <span className={cn('w-2.5 h-2.5 rounded-full', BUCKET_COLOR[b])} />
                  <span className="text-[10px] font-medium text-muted-foreground">{BUCKET_LABEL[b]}</span>
                </div>
              ))}
            </div>

            {/* Insight */}
            {insight && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-2xl bg-primary/5 border border-primary/10">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs font-medium text-foreground leading-relaxed">{insight}</p>
              </div>
            )}

            {source === 'fallback' && (
              <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Showing typical pattern — society history will appear soon.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
