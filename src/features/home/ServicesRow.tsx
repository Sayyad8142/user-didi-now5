import React, { useState } from 'react';
import femaleMaidImage from '@/assets/female-maid.webp';
import femaleBathroomCleanerImage from '@/assets/female-bathroom-cleaner.webp';
import { Info } from 'lucide-react';
import { WhatsIncludedSheet, type IncludedServiceType } from '@/features/services/WhatsIncludedSheet';

interface ServicesRowProps {
  onServiceSelect: (service: 'maid' | 'bathroom_cleaning') => void;
}

const services = [
  {
    id: 'maid' as const,
    title: 'Maid',
    image: femaleMaidImage,
  },
  {
    id: 'bathroom_cleaning' as const,
    title: 'Bathroom Cleaning',
    image: femaleBathroomCleanerImage,
  },
];

export function ServicesRow({ onServiceSelect }: ServicesRowProps) {
  const [infoFor, setInfoFor] = useState<IncludedServiceType | null>(null);

  return (
    <>
      <div className="flex justify-between gap-4">
        {services.map((service) => (
          <div key={service.id} className="flex flex-col items-center gap-2 flex-1">
            <button
              onClick={() => onServiceSelect(service.id)}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-20 h-20 rounded-full shadow-md overflow-hidden hover:scale-105 transition-transform">
                <img
                  src={service.image}
                  alt={service.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-sm font-medium text-center leading-tight">
                {service.title}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInfoFor(service.id);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              aria-label={`What's included in ${service.title}`}
            >
              <Info className="w-3 h-3" />
              What's Included?
            </button>
          </div>
        ))}
      </div>

      <WhatsIncludedSheet
        open={!!infoFor}
        onOpenChange={(o) => !o && setInfoFor(null)}
        serviceType={infoFor ?? 'maid'}
        source="home"
      />
    </>
  );
}
