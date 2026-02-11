import React from 'react';
import { Clock } from 'lucide-react';
import { isOpenNow } from './time';

interface ServiceHoursProps {
  serviceType?: string;
}

export function ServiceHours({ serviceType }: ServiceHoursProps) {
  const isOpen = isOpenNow(serviceType);

  return (
    <div className="flex items-center gap-4 p-4 rounded-[20px] bg-card border border-border/50 shadow-sm">
      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Clock className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-bold text-foreground">Service Hours</h3>
        <p className="text-sm font-semibold text-primary mt-0.5">6 AM – 7 PM Daily</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isOpen ? '🟢 Currently Open' : '🔴 Currently Closed'}
        </p>
      </div>
    </div>
  );
}
