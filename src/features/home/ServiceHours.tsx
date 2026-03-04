import React from 'react';
import { Clock } from 'lucide-react';
import { isOpenNow, getOpenStatusText, getServiceHoursText } from './time';

interface ServiceHoursProps {
  serviceType?: string;
}

export function ServiceHours({ serviceType }: ServiceHoursProps) {
  const isOpen = isOpenNow(serviceType);
  
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{getServiceHoursText(serviceType)}</span>
      </div>
      <span className={`text-xs font-semibold ${isOpen ? 'text-green-600' : 'text-muted-foreground'}`}>
        {isOpen ? '● Open now' : getOpenStatusText(serviceType)}
      </span>
    </div>
  );
}