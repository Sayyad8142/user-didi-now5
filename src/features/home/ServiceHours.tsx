import React from 'react';
import { isOpenNow, getOpenStatusText } from './time';

interface ServiceHoursProps {
  serviceType?: string;
}

export function ServiceHours({ serviceType }: ServiceHoursProps) {
  const isOpen = isOpenNow(serviceType);

  return (
    <div className="flex flex-col items-center py-2">
      {/* Hanging string */}
      <div className="w-px h-5 bg-border" />
      {/* Sign board */}
      <div
        className={`
          relative rounded-lg px-6 py-3 text-center shadow-md border
          ${isOpen
            ? 'bg-gradient-to-br from-amber-800 to-amber-950 border-amber-700'
            : 'bg-gradient-to-br from-stone-700 to-stone-900 border-stone-600'}
        `}
      >
        <p className="text-[11px] font-medium text-white/70 italic tracking-wide">
          {isOpen ? "Come in, we're" : "Sorry, we're"}
        </p>
        <p className="text-xl font-extrabold text-white tracking-wider mt-0.5">
          {isOpen ? 'OPEN' : 'CLOSED'}
        </p>
        <p className="text-[10px] text-white/60 mt-1">
          {isOpen ? '7 AM – 7 PM Daily' : getOpenStatusText(serviceType)}
        </p>
      </div>
    </div>
  );
}