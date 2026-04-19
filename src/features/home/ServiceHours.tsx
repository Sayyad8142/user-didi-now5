import React from 'react';
import { Clock } from 'lucide-react';
import { isOpenNow, getOpenStatusText, getServiceHoursText } from './time';
import { cn } from '@/lib/utils';

interface ServiceHoursProps {
  serviceType?: string;
}

export function ServiceHours({ serviceType }: ServiceHoursProps) {
  const isOpen = isOpenNow(serviceType);

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl bg-card border px-4 py-3.5 shadow-sm transition-colors",
      isOpen ? "border-emerald-500" : "border-red-500"
    )}>
      {/* subtle accent stripe */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-0 h-full w-1',
          isOpen ? 'bg-emerald-500/80' : 'bg-muted-foreground/30'
        )}
      />

      <div className="flex items-center gap-3 pl-1">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" strokeWidth={2.2} />
          </div>
          {/* live status dot */}
          <span
            aria-hidden
            className={cn(
              'absolute -top-0.5 -right-0.5 inline-flex h-3 w-3 rounded-full ring-2 ring-card',
              isOpen ? 'bg-emerald-500' : 'bg-muted-foreground/60'
            )}
          >
            {isOpen && (
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
            )}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
              Service Hours
            </h3>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                isOpen
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-muted text-muted-foreground ring-1 ring-border'
              )}
            >
              {isOpen ? 'Open' : 'Closed'}
            </span>
          </div>
          <p className="text-[13px] font-medium text-muted-foreground mt-0.5">
            {getServiceHoursText(serviceType)}
          </p>
          {!isOpen && (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {getOpenStatusText(serviceType)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
