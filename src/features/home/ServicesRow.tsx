import React from 'react';
import { ArrowRight } from 'lucide-react';
import maidImageAsset from '@/assets/service-card-maid.png.asset.json';
import bathroomImageAsset from '@/assets/service-card-bathroom.png.asset.json';

interface ServicesRowProps {
  onServiceSelect: (service: 'maid' | 'bathroom_cleaning') => void;
}

const services = [
  { id: 'maid' as const, title: 'Maid', image: maidImage },
  { id: 'bathroom_cleaning' as const, title: 'Bathroom Cleaning', image: bathroomImage },
];

export function ServicesRow({ onServiceSelect }: ServicesRowProps) {
  return (
    <section aria-labelledby="select-service-heading" className="space-y-3">
      <h2 id="select-service-heading" className="text-base font-semibold text-foreground">
        Select a Service
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => onServiceSelect(service.id)}
            aria-label={`Book ${service.title}`}
            className="group flex h-full flex-col rounded-[20px] border border-border bg-card p-2 text-left shadow-sm transition-all duration-150 hover:shadow-md hover:border-primary/40 active:scale-[0.97] active:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-primary/5">
              <img
                src={service.image}
                alt={service.title}
                width={944}
                height={704}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-1 flex-col justify-between gap-2 px-1.5 pb-1 pt-2.5">
              <span className="text-[15px] font-semibold leading-tight text-foreground">
                {service.title}
              </span>
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                Book Now <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
