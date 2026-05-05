import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Activity, CheckCircle2, AlertCircle, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkerCount {
  service: string;
  count: number;
  label: string;
}

interface WorkerAvailabilityCardProps {
  counts: Record<string, number>;
  loading: boolean;
  onServiceSelect?: (service: 'maid' | 'bathroom_cleaning') => void;
}

const serviceLabels: Record<string, string> = {
  maid: 'Maids',
  bathroom_cleaning: 'Bathroom Cleaners',
};

export function WorkerAvailabilityCard({ counts, loading, onServiceSelect }: WorkerAvailabilityCardProps) {
  const workerCounts: WorkerCount[] = Object.entries(counts)
    .filter(([service]) => service !== 'cook')
    .map(([service, count]) => ({
      service,
      count,
      label: serviceLabels[service] || service,
    }));

  const isUrgent = (count: number) => count <= 3;

  const getAvailabilityColor = (count: number) => {
    return isUrgent(count) ? 'from-[#ff007a] to-rose-500' : 'from-emerald-500 to-green-600';
  };

  const getAvailabilityIcon = (count: number) => {
    return isUrgent(count) ? AlertCircle : CheckCircle2;
  };

  const getAvailabilityText = (count: number) => {
    if (count === 0) return 'Try scheduling for tomorrow';
    return isUrgent(count)
      ? `Only ${count} Experts Left`
      : `${count} Available Now`;
  };

  if (loading) {
    return (
      <Card className="relative overflow-hidden border border-border/50 bg-card rounded-3xl shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="h-6 w-40 bg-muted/50 rounded-lg animate-pulse mb-2" />
              <div className="h-4 w-32 bg-muted/30 rounded animate-pulse" />
            </div>
          </div>
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-muted/20 rounded-2xl animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (workerCounts.length === 0) {
    return (
      <Card className="relative overflow-hidden border border-border/50 bg-card rounded-3xl shadow-sm">
        <CardContent className="p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No workers online</h3>
          <p className="text-sm text-muted-foreground">Try scheduling for a later time</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300">
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
      
      <CardContent className="relative p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center backdrop-blur-sm">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground mb-0.5">Worker Availability</h3>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary animate-pulse" />
              <p className="text-sm text-muted-foreground font-medium">Online now</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {workerCounts.map(({ service, count, label }) => {
            const urgent = isUrgent(count);
            const gradientColor = getAvailabilityColor(count);
            const statusText = getAvailabilityText(count);
            const StatusIcon = getAvailabilityIcon(count);
            const percentage = Math.min(100, (count / 100) * 100);

            const clickable = !!onServiceSelect && (service === 'maid' || service === 'bathroom_cleaning');
            return (
              <div
                key={service}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onServiceSelect!(service as 'maid' | 'bathroom_cleaning') : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onServiceSelect!(service as 'maid' | 'bathroom_cleaning'); } } : undefined}
                aria-label={clickable ? `Book ${label}` : undefined}
                className={cn(
                  "group relative p-4 rounded-2xl bg-background/80 backdrop-blur-sm border border-border/50 transition-all duration-300",
                  clickable && "cursor-pointer hover:border-primary/30 hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/30"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center",
                      urgent ? 'bg-[#ff007a]/10' : 'bg-green-500/10'
                    )}>
                      {urgent ? (
                        <Flame className="w-4 h-4 text-[#ff007a]" />
                      ) : (
                        <StatusIcon className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-base">{label}</span>
                        <div className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm text-white",
                          urgent ? 'bg-[#ff007a] animate-pulse' : 'bg-green-500'
                        )}>
                          {count}
                        </div>
                      </div>
                      <p className={cn(
                        "text-xs font-semibold mt-0.5",
                        urgent ? 'text-[#ff007a]' : 'text-green-600'
                      )}>
                        {statusText}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="relative h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r shadow-sm",
                      gradientColor
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                    style={{ 
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2.5s infinite linear'
                    }} 
                  />
                </div>
              </div>
            );
          })}
        </div>

      </CardContent>
    </Card>
  );
}
