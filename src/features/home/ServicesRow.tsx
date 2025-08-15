import React from 'react';

interface ServicesRowProps {
  onServiceSelect: (service: 'maid' | 'cook' | 'bathroom_cleaning') => void;
}

const services = [
  {
    id: 'maid' as const,
    title: 'Maid',
    image: 'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 'cook' as const,
    title: 'Cook', 
    image: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 'bathroom_cleaning' as const,
    title: 'Bathroom Cleaning',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop&crop=center'
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
          <div className="w-20 h-20 rounded-full border-2 border-primary shadow-md overflow-hidden hover:scale-105 transition-transform">
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