import React from 'react';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { isOpenNow, getOpenStatusText, getServiceHoursText } from './time';

interface ServiceHoursProps {
  serviceType?: string;
}

export function ServiceHours({ serviceType }: ServiceHoursProps) {
  const isOpen = isOpenNow(serviceType);
  
  return (
    <Card className="shadow-card border-pink-100 bg-gradient-to-r from-pink-50 to-pink-100">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Clock className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Service Hours</h3>
          <p className="text-sm font-medium text-primary">{getServiceHoursText(serviceType)}</p>
          {!isOpen && (
            <p className="text-xs text-muted-foreground mt-1">
              {getOpenStatusText(serviceType)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}