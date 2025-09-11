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

  const [loadedImages, setLoadedImages] = React.useState<Set<number>>(new Set());

  const handleImageLoad = (index: number) => {
    setLoadedImages(prev => new Set(prev).add(index));
  };

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
                {/* Background gradient placeholder */}
                <div 
                  className={`absolute inset-0 bg-gradient-to-br from-pink-200 to-purple-200 transition-opacity duration-500 ${
                    loadedImages.has(index) ? 'opacity-0' : 'opacity-100'
                  }`}
                />
                
                <img
                  src={image.url}
                  alt={image.alt}
                  className={`w-full h-full object-cover transition-opacity duration-500 ${
                    loadedImages.has(index) ? 'opacity-100' : 'opacity-0'
                  }`}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={index === 0 ? "high" : "low"}
                  onLoad={() => handleImageLoad(index)}
                  onError={(e) => {
                    console.error('Banner image failed to load:', image.url);
                    e.currentTarget.style.display = 'none';
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