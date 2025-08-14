import React from 'react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';

const carouselImages = [
  {
    url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=450&fit=crop&crop=center",
    alt: "Food preparation service"
  },
  {
    url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&h=450&fit=crop&crop=center", 
    alt: "House cleaning service"
  },
  {
    url: "https://images.unsplash.com/photo-1563453392212-326f5e854473?w=800&h=450&fit=crop&crop=center",
    alt: "Bathroom cleaning service"
  }
];

export function HeroCarousel() {
  const plugin = React.useRef(
    Autoplay({ delay: 4000, stopOnInteraction: true })
  );

  return (
    <div className="relative">
      <Carousel
        plugins={[plugin.current]}
        className="w-full"
        onMouseEnter={plugin.current.stop}
        onMouseLeave={plugin.current.reset}
      >
        <CarouselContent>
          {carouselImages.map((image, index) => (
            <CarouselItem key={index}>
              <div className="relative rounded-2xl overflow-hidden shadow-card aspect-video">
                <img
                  src={image.url}
                  alt={image.alt}
                  className="w-full h-full object-cover"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}