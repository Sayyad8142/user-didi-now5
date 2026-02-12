import React from 'react';
import femaleMaidImage from '@/assets/female-maid.webp';
import femaleBathroomCleanerImage from '@/assets/female-bathroom-cleaner.webp';
import { AlertCircle } from 'lucide-react';

interface ServicesRowProps {
  onServiceSelect: (service: 'maid' | 'bathroom_cleaning') => void;
  isServiceAvailable?: (service: string) => boolean;
  loading?: boolean;
}

const services = [
  {
    id: 'maid' as const,
    title: 'Maid',
    image: femaleMaidImage
  },
  {
    id: 'bathroom_cleaning' as const,
    title: 'Bathroom Cleaning',
    image: femaleBathroomCleanerImage
  }
];

export function ServicesRow({ onServiceSelect, isServiceAvailable, loading }: ServicesRowProps) {
  return (
    <div className="flex justify-between gap-4">
      {services.map((service) => {
        const available = loading || !isServiceAvailable || isServiceAvailable(service.id);
        
        return (
          <button
            key={service.id}
            onClick={() => available && onServiceSelect(service.id)}
            disabled={!available}
            className={`flex flex-col items-center gap-2 flex-1 ${!available ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className={`w-20 h-20 rounded-full shadow-md overflow-hidden ${available ? 'hover:scale-105' : 'grayscale'} transition-transform relative`}>
              <img
                src={service.image}
                alt={service.title}
                className="w-full h-full object-cover"
              />
              {!available && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
            <span className="text-sm font-medium text-center leading-tight">
              {service.title}
            </span>
            {!available && (
              <span className="text-[10px] text-rose-500 font-medium -mt-1">Unavailable</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
