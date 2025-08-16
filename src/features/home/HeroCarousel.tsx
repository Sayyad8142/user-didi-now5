import React from 'react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import bannerCook1 from '@/assets/banner-cook-1.webp';
import bannerMaid1 from '@/assets/banner-maid-1.webp';
import bannerCook2 from '@/assets/banner-cook-2.webp';

const carouselImages = [
  {
    url: bannerCook1,
    alt: "Professional cooking service - Fresh meal preparation"  
  },
  {
    url: bannerMaid1,
    alt: "Professional cleaning service - Modern kitchen cleaning"
  },
  {
    url: bannerCook2,
    alt: "Expert cooking service - Healthy meal preparation"
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