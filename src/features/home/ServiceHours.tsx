import React from 'react';
import { isOpenNow, getOpenStatusText } from './time';

interface ServiceHoursProps {
  serviceType?: string;
}

export function ServiceHours({ serviceType }: ServiceHoursProps) {
  const isOpen = isOpenNow(serviceType);

  return (
    <div className="flex items-center justify-center gap-1.5 py-1">
      <span className={`inline-block w-2 h-2 rounded-full ${isOpen ? 'bg-green-500' : 'bg-muted-foreground'}`} />
      <span className="text-xs font-medium text-muted-foreground">
        {isOpen ? 'Open' : 'Closed'} · {isOpen ? '7 AM – 7 PM' : getOpenStatusText(serviceType)}
      </span>
    </div>
  );
}