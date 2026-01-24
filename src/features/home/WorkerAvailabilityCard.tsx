import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface WorkerCount {
  service: string;
  count: number;
  label: string;
}

export function WorkerAvailabilityCard() {
  const [workerCounts, setWorkerCounts] = useState<WorkerCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkerCounts();
  }, []);

  const loadWorkerCounts = async () => {
    try {
      const { data: workers, error } = await supabase
        .from('workers')
        .select('service_types, is_active')
        .eq('is_active', true);

      if (error) throw error;

      const counts = new Map<string, number>();
      workers?.forEach(worker => {
        worker.service_types?.forEach((service: string) => {
          counts.set(service, (counts.get(service) || 0) + 1);
        });
      });

      const serviceLabels: Record<string, string> = {
        maid: 'Maids',
        cook: 'Cooks',
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

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-2xl animate-pulse">
        <div className="w-8 h-8 rounded-full bg-muted/50" />
        <div className="flex-1 flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-16 bg-muted/50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (workerCounts.length === 0) {
    return null;
  }

  const totalWorkers = workerCounts.reduce((sum, w) => sum + w.count, 0);

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-accent/30 rounded-2xl border border-border/50">
      {/* Live indicator */}
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
          <Users className="w-4 h-4 text-primary" />
        </div>
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold text-foreground">
            {totalWorkers} Workers Online
          </span>
          <span className="text-[10px] text-muted-foreground">• Live</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {workerCounts.map(({ service, count, label }) => (
            <span key={service} className="flex items-center gap-1">
              <span className="font-medium text-foreground/80">{count}</span>
              <span>{label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
