import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp } from 'lucide-react';
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

      // Count workers by service type
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

  const getAvailabilityLevel = (count: number): 'high' | 'medium' | 'low' => {
    if (count >= 5) return 'high';
    if (count >= 3) return 'medium';
    return 'low';
  };

  const getAvailabilityColor = (level: 'high' | 'medium' | 'low') => {
    switch (level) {
      case 'high':
        return 'bg-green-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-red-500';
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
      <Card className="shadow-card border-border/50 bg-gradient-to-br from-white via-white to-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="h-5 w-32 bg-muted rounded animate-pulse mb-1" />
              <div className="h-3 w-24 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (workerCounts.length === 0) {
    return null;
  }

  return (
    <Card className="shadow-card border-border/50 bg-gradient-to-br from-white via-white to-primary/5 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Worker Availability</h3>
            <p className="text-xs text-muted-foreground">Real-time service status</p>
          </div>
          <TrendingUp className="w-4 h-4 text-primary animate-pulse" />
        </div>

        <div className="space-y-3">
          {workerCounts.map(({ service, count, label }) => {
            const level = getAvailabilityLevel(count);
            const barColor = getAvailabilityColor(level);
            const statusText = getAvailabilityText(level);
            const percentage = Math.min(100, (count / 10) * 100);

            return (
              <div key={service} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="font-bold text-primary">{count}</span>
                  </div>
                  <span className={`text-xs font-medium ${
                    level === 'high' ? 'text-green-600' : 
                    level === 'medium' ? 'text-yellow-600' : 
                    'text-red-600'
                  }`}>
                    {statusText}
                  </span>
                </div>
                
                {/* Availability Bar */}
                <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${percentage}%` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" 
                       style={{ 
                         backgroundSize: '200% 100%',
                         animation: 'shimmer 2s infinite'
                       }} 
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Message */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <p className="text-xs text-center text-muted-foreground">
            ✨ Booking confirmed instantly when workers available
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
