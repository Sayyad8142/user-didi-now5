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

const serviceLabels: Record<string, string> = {
  maid: 'Maids',
  bathroom_cleaning: 'Bathroom Cleaners',
};

interface Props {
  counts: Record<string, number>;
  loading: boolean;
  onServiceSelect?: (service: Service) => void;
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
