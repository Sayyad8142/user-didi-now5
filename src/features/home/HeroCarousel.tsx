import React from 'react';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import bannerMaid1 from '@/assets/banner-maid-1.webp';
import bannerInstantMaid from '@/assets/banner-instant-maid-service.webp';
import bannerInstantBathroom from '@/assets/banner-instant-maid-service.webp';
import bannerMaid2 from '@/assets/banner-maid-1.webp';

const carouselImages = [
{
  url: bannerInstantMaid,
  alt: "Instant maid service - Your maid on leave? We will send one in 10 mins"
},
{
  url: bannerMaid1,
  alt: "Professional cleaning service - Modern kitchen cleaning"
},
{
  url: bannerInstantBathroom,
  alt: "Bathroom deep cleaning and sanitization service"
},
{
  url: bannerMaid2,
  alt: "Trusted and verified maids at your doorstep"
}];


export function HeroCarousel() {
  const plugin = React.useRef(
    Autoplay({ delay: 3000, stopOnInteraction: false })
  );

  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [loadedImages, setLoadedImages] = React.useState<Set<number>>(new Set());

  React.useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  const handleImageLoad = (index: number) => {
    setLoadedImages((prev) => new Set(prev).add(index));
  };

  return (
    <div className="relative">
      <Carousel
        plugins={[plugin.current]}
        className="w-full"
        setApi={setApi}
        opts={{ loop: true }}>

        <CarouselContent>
          {carouselImages.map((image, index) =>
          <CarouselItem key={index}>
              <div className="relative rounded-[20px] overflow-hidden shadow-lg aspect-[16/7] bg-gradient-to-br from-pink-100 to-pink-50">
                <div
                className={`absolute inset-0 bg-gradient-to-br from-pink-200 to-pink-100 transition-opacity duration-500 ${
                loadedImages.has(index) ? 'opacity-0' : 'opacity-100'}`
                } />

                <img
                src={image.url}
                alt={image.alt}
                className={`w-full h-full object-cover transition-opacity duration-500 ${
                loadedImages.has(index) ? 'opacity-100' : 'opacity-0'}`
                }
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={index === 0 ? "high" : "low"}
                onLoad={() => handleImageLoad(index)}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }} />

              </div>
            </CarouselItem>
          )}
        </CarouselContent>
      </Carousel>
      {/* Dot indicators */}
      










    </div>);

}