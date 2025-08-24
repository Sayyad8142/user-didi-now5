import React from 'react';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { isOpenNow, getOpenStatusText } from './time';

export function ServiceHours() {
  const isOpen = isOpenNow();
  
  return (
    <Card className="shadow-sm border-border/50 bg-card hover:shadow-md transition-shadow duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Clock className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Service Hours</h3>
              <p className="text-sm text-muted-foreground">6AM - 7PM Daily</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              isOpen ? 'bg-green-500' : 'bg-amber-500'
            }`} />
            <span className={`text-sm font-medium ${
              isOpen ? 'text-green-600' : 'text-amber-600'
            }`}>
              {isOpen ? 'Open' : 'Closed'}
            </span>
          </div>
        </div>
        
        {!isOpen && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              {getOpenStatusText()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}