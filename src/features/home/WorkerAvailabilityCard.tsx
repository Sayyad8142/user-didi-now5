import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Activity, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useProfile } from '@/contexts/ProfileContext';

interface WorkerCount {
  service: string;
  count: number;
  label: string;
}

export function WorkerAvailabilityCard() {
  const { profile } = useProfile();
  const [workerCounts, setWorkerCounts] = useState<WorkerCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkerCounts();
  }, [profile?.community]);

  const loadWorkerCounts = async () => {
    try {
      let query = supabase
        .from('workers')
        .select('service_types, is_active, is_available')
        .eq('is_active', true)
        .eq('is_available', true);

      // Filter by user's community if available
      if (profile?.community && profile.community !== 'other') {
        query = query.contains('communities', [profile.community]);
      }

      const { data: workers, error } = await query;

      if (error) throw error;

      // Count workers by service type
      const counts = new Map<string, number>();
      workers?.forEach(worker => {
        worker.service_types?.forEach((service: string) => {
          counts.set(service, (counts.get(service) || 0) + 1);
        });
      });

      const serviceLabels: Record<string, string> = {
        maid: 'Maids',
        bathroom_cleaning: 'Cleaners'
      };

      const result = Array.from(counts.entries()).map(([service, count]) => ({
        service,
        count,
        label: serviceLabels[service] || service
      }));

      setWorkerCounts(result);
    } catch (error) {
      console.error('Error loading worker counts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAvailabilityLevel = (count: number): 'high' | 'medium' | 'low' => {
    if (count >= 5) return 'high';
    if (count >= 3) return 'medium';
    return 'low';
  };

  const getAvailabilityColor = (level: 'high' | 'medium' | 'low') => {
    switch (level) {
      case 'high':
        return 'from-emerald-500 to-green-600';
      case 'medium':
        return 'from-amber-400 to-orange-500';
      case 'low':
        return 'from-rose-400 to-red-500';
    }
  };

  const getAvailabilityIcon = (level: 'high' | 'medium' | 'low') => {
    switch (level) {
      case 'high':
        return CheckCircle2;
      case 'medium':
        return Clock;
      case 'low':
        return AlertCircle;
    }
  };

  const getAvailabilityText = (level: 'high' | 'medium' | 'low') => {
    switch (level) {
      case 'high':
        return 'High booking confirmation';
      case 'medium':
        return 'Moderate availability';
      case 'low':
        return 'Limited availability';
    }
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
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted/20 rounded-2xl animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (workerCounts.length === 0) {
    return null;
  }

  return (
    <Card className="relative overflow-hidden border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-300">
      <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
      
      <CardContent className="relative p-6">
        {/* Header */}
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
              <p className="text-sm text-muted-foreground font-medium">Live service status</p>
            </div>
          </div>
        </div>

        {/* Service Cards */}
        <div className="space-y-3">
          {workerCounts.map(({ service, count, label }) => {
            const level = getAvailabilityLevel(count);
            const gradientColor = getAvailabilityColor(level);
            const statusText = getAvailabilityText(level);
            const StatusIcon = getAvailabilityIcon(level);
            const percentage = Math.min(100, (count / 10) * 100);

            return (
              <div 
                key={service} 
                className="group relative p-4 rounded-2xl bg-background/80 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center",
                      level === 'high' ? 'bg-green-500/10' : 
                      level === 'medium' ? 'bg-amber-500/10' : 
                      'bg-rose-500/10'
                    )}>
                      <StatusIcon className={cn(
                        "w-4 h-4",
                        level === 'high' ? 'text-green-600' : 
                        level === 'medium' ? 'text-amber-600' : 
                        'text-rose-600'
                      )} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-base">{label}</span>
                        <div className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm",
                          level === 'high' ? 'bg-green-500 text-white' : 
                          level === 'medium' ? 'bg-amber-500 text-white' : 
                          'bg-rose-500 text-white'
                        )}>
                          {count}
                        </div>
                      </div>
                      <p className={cn(
                        "text-xs font-medium mt-0.5",
                        level === 'high' ? 'text-green-600' : 
                        level === 'medium' ? 'text-amber-600' : 
                        'text-rose-600'
                      )}>
                        {statusText}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Gradient Progress Bar */}
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

        {/* Footer Badge */}
        <div className="mt-5 pt-4 border-t border-border/30">
          <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/10">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <p className="text-xs font-medium text-foreground/80">
              Instant booking confirmation when available
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
