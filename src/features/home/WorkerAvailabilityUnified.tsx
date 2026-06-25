import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Users,
  Activity,
  CheckCircle2,
  AlertCircle,
  Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/contexts/ProfileContext';


type Service = 'maid' | 'bathroom_cleaning';

const SERVICE_TABS: { id: Service; label: string }[] = [
  { id: 'maid', label: 'Maids' },
  { id: 'bathroom_cleaning', label: 'Bathroom' },
];

const serviceLabels: Record<string, string> = {
  maid: 'Maids',
  bathroom_cleaning: 'Bathroom Cleaners',
};

interface Props {
  counts: Record<string, number>;
  loading: boolean;
  onServiceSelect?: (service: Service) => void;
}

function formatHour(h: number) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${suffix}`;
}

// Group contiguous hours by tier into ranges
type Tier = 'best' | 'good' | 'low';
function tierFor(slot: ForecastSlot): Tier {
  if (slot.availability_pct >= 60) return 'best';
  if (slot.availability_pct >= 40) return 'good';
  return 'low';
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

function pickTopBands(slots: ForecastSlot[]) {
  const bands = buildBands(slots);
  const pickLongest = (tier: Tier) =>
    bands
      .filter((b) => b.tier === tier)
      .sort((a, b) => b.end - b.start - (a.end - a.start))[0] || null;
  return {
    best: pickLongest('best'),
    good: pickLongest('good'),
    low: pickLongest('low'),
  };
}

function buildInsight(
  slots: ForecastSlot[],
  service: Service,
  community: string | null | undefined,
): string | null {
  if (!slots.length) return null;
  const label = service === 'maid' ? 'maid' : 'bathroom cleaner';
  const bands = pickTopBands(slots);
  const place = community && community !== 'other' ? ` in your society` : '';

  if (bands.best) {
    const a = formatHour(bands.best.start);
    const b = formatHour(bands.best.end);
    if (bands.low) {
      return `Best time to book a ${label}${place}: ${a} – ${b}. Availability drops between ${formatHour(
        bands.low.start,
      )} – ${formatHour(bands.low.end)}.`;
    }
    return `Booking a ${label} between ${a} – ${b} gives the highest chance of instant assignment.`;
  }
  if (bands.low) {
    return `Worker shortage usually observed ${formatHour(
      bands.low.start,
    )} – ${formatHour(bands.low.end)}. Try scheduling earlier in the day.`;
  }
  return `${label[0].toUpperCase() + label.slice(1)} availability looks steady throughout the day.`;
}

function LiveRow({
  service,
  count,
  label,
  onClick,
}: {
  service: string;
  count: number;
  label: string;
  onClick?: () => void;
}) {
  const urgent = count <= 3;
  const empty = count === 0;
  const statusText = empty
    ? 'Try scheduling for tomorrow'
    : urgent
    ? `Only ${count} left`
    : `${count} available now`;
  const StatusIcon = empty ? AlertCircle : urgent ? Flame : CheckCircle2;
  const tone = empty
    ? 'text-rose-600 bg-rose-500/10'
    : urgent
    ? 'text-[#ff007a] bg-[#ff007a]/10'
    : 'text-green-600 bg-green-500/10';
  const badgeTone = empty
    ? 'bg-rose-500'
    : urgent
    ? 'bg-[#ff007a] animate-pulse'
    : 'bg-green-500';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center justify-between p-3 rounded-2xl bg-background/80 border border-border/50 transition-all',
        onClick &&
          'cursor-pointer hover:border-primary/30 hover:shadow-sm active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/30',
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', tone)}
        >
          <StatusIcon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm truncate">{label}</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm',
                badgeTone,
              )}
            >
              {count}
            </span>
          </div>
          <p
            className={cn(
              'text-[11px] font-medium mt-0.5',
              empty ? 'text-rose-600' : urgent ? 'text-[#ff007a]' : 'text-green-600',
            )}
          >
            {statusText}
          </p>
        </div>
      </div>
    </div>
  );
}

function TierRow({
  tier,
  band,
}: {
  tier: Tier;
  band: { start: number; end: number } | null;
}) {
  const meta =
    tier === 'best'
      ? { dot: 'bg-emerald-500', label: 'Best', text: 'text-emerald-700' }
      : tier === 'good'
      ? { dot: 'bg-amber-400', label: 'Good', text: 'text-amber-700' }
      : { dot: 'bg-rose-500', label: 'Low', text: 'text-rose-600' };

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={cn('w-2.5 h-2.5 rounded-full', meta.dot)} />
        <span className="text-xs font-medium text-foreground">
          {band ? `${formatHour(band.start)} – ${formatHour(band.end)}` : '—'}
        </span>
      </div>
      <span className={cn('text-[11px] font-semibold', meta.text)}>{meta.label}</span>
    </div>
  );
}

export function WorkerAvailabilityUnified({ counts, loading, onServiceSelect }: Props) {
  const { profile } = useProfile();
  const hasCommunity = !!profile?.community && profile.community !== 'other';


  const workerCounts = Object.entries(counts)
    .filter(([service]) => service !== 'cook')
    .map(([service, count]) => ({
      service,
      count,
      label: serviceLabels[service] || service,
    }));

  return (
    <Card className="relative overflow-hidden border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 rounded-3xl shadow-lg">
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <CardContent className="relative p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight">
              Worker Availability
            </h3>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-primary animate-pulse" />
              <p className="text-[11px] text-muted-foreground font-medium">
                Live now {hasCommunity && '· Today\u2019s forecast'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 1 — Live now */}
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Available right now
          </p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 rounded-2xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : workerCounts.length === 0 ? (
            <div className="p-3 rounded-2xl bg-background/80 border border-border/50 text-sm text-muted-foreground text-center">
              No workers online — try scheduling for tomorrow
            </div>
          ) : (
            <div className="space-y-2">
              {workerCounts.map(({ service, count, label }) => {
                const clickable =
                  !!onServiceSelect && (service === 'maid' || service === 'bathroom_cleaning');
                return (
                  <LiveRow
                    key={service}
                    service={service}
                    count={count}
                    label={label}
                    onClick={
                      clickable ? () => onServiceSelect!(service as Service) : undefined
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
