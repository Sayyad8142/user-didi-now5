import React from 'react';
import { Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkerAvailability } from '@/hooks/useWorkerAvailability';
import { cn } from '@/lib/utils';

export function WorkerAvailability() {
  const { availability, loading } = useWorkerAvailability();

  if (loading) {
    return (
      <Card className="shadow-card border-border/50 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Worker Availability</h3>
              <p className="text-xs text-muted-foreground">Loading...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-card border-border/50 overflow-hidden hover:shadow-lg transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Worker Availability</h3>
            <p className="text-xs text-muted-foreground">Real-time updates</p>
          </div>
        </div>

        <div className="space-y-3">
          {availability.map((service) => {
            const availabilityLevel = 
              service.count >= 5 ? 'high' :
              service.count >= 3 ? 'medium' : 'low';
            
            const barColor = 
              availabilityLevel === 'high' ? 'bg-green-500' :
              availabilityLevel === 'medium' ? 'bg-yellow-500' : 'bg-red-500';
            
            const bgColor = 
              availabilityLevel === 'high' ? 'bg-green-50' :
              availabilityLevel === 'medium' ? 'bg-yellow-50' : 'bg-red-50';
            
            const textColor = 
              availabilityLevel === 'high' ? 'text-green-700' :
              availabilityLevel === 'medium' ? 'text-yellow-700' : 'text-red-700';

            const percentage = Math.min((service.count / 10) * 100, 100);

            return (
              <div key={service.service} className={cn("p-3 rounded-xl transition-all", bgColor)}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground capitalize">
                    {service.service === 'maid' ? 'Maids' : 
                     service.service === 'cook' ? 'Cooks' : 
                     'Bathroom Cleaners'}
                  </span>
                  <span className={cn("font-bold text-lg", textColor)}>
                    {service.count}
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="relative h-2 bg-white/50 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full transition-all duration-500", barColor)}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                
                <p className="text-xs text-muted-foreground mt-2">
                  {availabilityLevel === 'high' ? '✓ High booking confirmation' :
                   availabilityLevel === 'medium' ? '⚡ Moderate availability' :
                   '⚠ Limited availability'}
                </p>
              </div>
            );
          })}
        </div>

        {availability.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No workers available at the moment
          </p>
        )}
      </CardContent>
    </Card>
  );
}
