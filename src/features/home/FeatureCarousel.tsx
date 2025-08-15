import React from 'react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Award, Headphones, Star } from 'lucide-react';
import Autoplay from 'embla-carousel-autoplay';

const features = [
  {
    title: 'Verified Experts',
    description: 'With valid ID proof & a spotless background for your peace of mind',
    icon: Shield,
    gradient: 'bg-gradient-to-br from-blue-400 to-blue-600',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600'
  },
  {
    title: 'Trained Professional',
    description: 'Equipped with the latest best practices to deliver top-notch services',
    icon: Award,
    gradient: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600'
  },
  {
    title: 'Dedicated Support',
    description: 'Always ready to ensure quick resolutions and a hassle-free experience',
    icon: Headphones,
    gradient: 'bg-gradient-to-br from-cyan-400 to-cyan-600',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600'
  },
  {
    title: 'We Value Your Feedback',
    description: 'Your reviews help us consistently monitor and enhance performance',
    icon: Star,
    gradient: 'bg-gradient-to-br from-amber-400 to-amber-600',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600'
  }
];

export function FeatureCarousel() {
  const plugin = React.useRef(
    Autoplay({ delay: 3000, stopOnInteraction: true })
  );

  return (
    <div className="w-full">
      <Carousel
        plugins={[plugin.current]}
        className="w-full"
        onMouseEnter={plugin.current.stop}
        onMouseLeave={plugin.current.reset}
      >
        <CarouselContent className="-ml-2 md:-ml-4">
          {features.map((feature, index) => (
            <CarouselItem key={index} className="pl-2 md:pl-4">
              <Card className="border-0 shadow-lg overflow-hidden">
                <CardContent className={`p-6 ${feature.gradient} text-white relative`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                      <p className="text-sm opacity-90 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                    <div className={`w-16 h-16 ${feature.iconBg} rounded-2xl flex items-center justify-center shrink-0 shadow-lg`}>
                      <feature.icon className={`w-8 h-8 ${feature.iconColor}`} />
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-6 flex gap-2">
                    {features.map((_, dotIndex) => (
                      <div
                        key={dotIndex}
                        className={`w-2 h-2 rounded-full transition-opacity ${
                          dotIndex === index ? 'bg-white' : 'bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}