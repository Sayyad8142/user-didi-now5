import React from 'react';
import { ChevronRight } from 'lucide-react';
import femaleMaidImage from '@/assets/female-maid.webp';
import femaleBathroomCleanerImage from '@/assets/female-bathroom-cleaner.webp';

interface ServicesRowProps {
  onServiceSelect: (service: 'maid' | 'bathroom_cleaning') => void;
}

const services = [
  {
    id: 'maid' as const,
    title: 'Maid',
    subtitle: 'Regular home cleaning',
    badge: '⚡ 10 mins arrival',
    image: femaleMaidImage,
  },
  {
    id: 'bathroom_cleaning' as const,
    title: 'Bathroom Cleaning',
    subtitle: 'Deep wash & sanitization',
    badge: '🧼 Deep Clean',
    image: femaleBathroomCleanerImage,
  },
];

export function ServicesRow({ onServiceSelect }: ServicesRowProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">What do you need today?</h2>

      <div className="space-y-3">
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => onServiceSelect(service.id)}
            className="group w-full flex items-center gap-4 p-3 rounded-[20px] bg-card border border-border/50 shadow-sm hover:shadow-lg hover:border-primary/30 active:scale-[0.98] transition-all duration-300 text-left"
          >
            {/* Image */}
            <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 shadow-sm">
              <img
                src={service.image}
                alt={service.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-foreground">{service.title}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{service.subtitle}</p>
              <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                {service.badge}
              </span>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
              <ChevronRight className="w-5 h-5 text-primary group-hover:text-primary-foreground" />
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        More services coming soon…
      </p>
    </div>
  );
}
