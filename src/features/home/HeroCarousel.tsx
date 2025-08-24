import React from 'react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import bannerCook1 from '@/assets/banner-cook-1.webp';
import bannerMaid1 from '@/assets/banner-maid-1.webp';
import bannerCook2 from '@/assets/banner-cook-2.webp';
import bannerInstantMaid from '@/assets/banner-instant-maid-service.webp';
import bannerInstantCook from '@/assets/banner-instant-cook-service.webp';

const carouselImages = [
  {
    url: bannerCook1,
    alt: "Professional cooking service - Fresh meal preparation"  
  },
  {
    url: bannerInstantMaid,
    alt: "Instant maid service - Your maid on leave today? No worry, we will send maid in 10 mins"
  },
  {
    url: bannerMaid1,
    alt: "Professional cleaning service - Modern kitchen cleaning"
  },
  {
    url: bannerInstantCook,
    alt: "Instant cook service - Your cook on leave today? No worry, we will send in 10 mins"
  },
  {
    url: bannerCook2,
    alt: "Expert cooking service - Healthy meal preparation"
  }
];

export function HeroCarousel() {
  const plugin = React.useRef(
    Autoplay({ delay: 3000, stopOnInteraction: true })
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
              <div className="relative rounded-2xl overflow-hidden shadow-card aspect-video bg-gradient-to-br from-pink-100 to-purple-100">
                <img
                  src={image.url}
                  alt={image.alt}
                  className="w-full h-full object-cover transition-opacity duration-300"
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  onLoad={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onError={(e) => {
                    console.error('Banner image failed to load:', image.url);
                    e.currentTarget.style.display = 'none';
                  }}
                  style={{
                    opacity: '0',
                    background: 'linear-gradient(135deg, #fdf2f8 0%, #f3e8ff 100%)'
                  }}
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}