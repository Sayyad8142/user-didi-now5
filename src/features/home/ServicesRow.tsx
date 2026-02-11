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
    subtitle: 'Regular home cleaning • 10 mins arrival',
    badge: '⚡ Instant Available',
    image: femaleMaidImage
  },
  {
    id: 'bathroom_cleaning' as const,
    title: 'Bathroom Cleaning',
    subtitle: 'Deep wash • Sanitization',
    badge: '🧼 Deep Clean',
    image: femaleBathroomCleanerImage
  }
];

export function ServicesRow({ onServiceSelect }: ServicesRowProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => onServiceSelect(service.id)}
            className="group relative overflow-hidden rounded-2xl border border-border/50 bg-white shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02] text-left"
          >
            {/* Image */}
            <div className="h-28 w-full overflow-hidden">
              <img
                src={service.image}
                alt={service.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>

            {/* Badge */}
            <div className="absolute top-2 left-2">
              <span className="inline-block px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-[10px] font-semibold text-foreground shadow-sm">
                {service.badge}
              </span>
            </div>

            {/* Content */}
            <div className="p-3">
              <h3 className="text-sm font-bold text-foreground mb-0.5">
                {service.title}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {service.subtitle}
              </p>
              <div className="mt-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#ff007a] text-white text-[11px] font-semibold">
                  Book Now →
                </span>
              </div>
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
