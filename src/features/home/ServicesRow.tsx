import React from 'react';
import femaleMaidImage from '@/assets/female-maid.webp';
import femaleBathroomCleanerImage from '@/assets/female-bathroom-cleaner.webp';

interface ServicesRowProps {
  onServiceSelect: (service: 'maid' | 'bathroom_cleaning') => void;
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

export function ServicesRow({ onServiceSelect }: ServicesRowProps) {
  return (
    <div className="flex justify-between gap-4">
      {services.map((service) => (
        <button
          key={service.id}
          onClick={() => onServiceSelect(service.id)}
          className="flex flex-col items-center gap-2 flex-1"
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
      ))}
    </div>
  );
}
