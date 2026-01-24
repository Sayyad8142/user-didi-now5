import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

  const totalWorkers = workerCounts.reduce((sum, w) => sum + w.count, 0);

  if (loading) {
    return (
      <div className="w-10 h-10 rounded-full bg-muted/50 animate-pulse" />
    );
  }

  if (workerCounts.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
          <Users className="w-5 h-5 text-primary" />
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {totalWorkers}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-foreground">Workers Online</span>
          </div>
          {workerCounts.map(({ service, count, label }) => (
            <div key={service} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{count}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
