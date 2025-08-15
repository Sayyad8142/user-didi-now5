import React from 'react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Award, Headphones, Star, Sparkles } from 'lucide-react';
import Autoplay from 'embla-carousel-autoplay';

const features = [
  {
    title: 'Verified Experts',
    description: 'With valid ID proof & a spotless background for your peace of mind',
    icon: Shield,
    gradient: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500',
    glassEffect: 'bg-white/10 backdrop-blur-xl border border-white/20',
    iconContainer: 'bg-gradient-to-br from-indigo-100 to-purple-100',
    iconColor: 'text-indigo-600',
    accentColor: 'border-indigo-200'
  },
  {
    title: 'Trained Professional',
    description: 'Equipped with the latest best practices to deliver top-notch services',
    icon: Award,
    gradient: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500',
    glassEffect: 'bg-white/10 backdrop-blur-xl border border-white/20',
    iconContainer: 'bg-gradient-to-br from-emerald-100 to-teal-100',
    iconColor: 'text-emerald-600',
    accentColor: 'border-emerald-200'
  },
  {
    title: 'Dedicated Support',
    description: 'Always ready to ensure quick resolutions and a hassle-free experience',
    icon: Headphones,
    gradient: 'bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500',
    glassEffect: 'bg-white/10 backdrop-blur-xl border border-white/20',
    iconContainer: 'bg-gradient-to-br from-blue-100 to-cyan-100',
    iconColor: 'text-blue-600',
    accentColor: 'border-blue-200'
  },
  {
    title: 'We Value Your Feedback',
    description: 'Your reviews help us consistently monitor and enhance performance',
    icon: Star,
    gradient: 'bg-gradient-to-br from-amber-500 via-orange-500 to-red-500',
    glassEffect: 'bg-white/10 backdrop-blur-xl border border-white/20',
    iconContainer: 'bg-gradient-to-br from-amber-100 to-orange-100',
    iconColor: 'text-amber-600',
    accentColor: 'border-amber-200'
  }
];

export function FeatureCarousel() {
  const plugin = React.useRef(
    Autoplay({ delay: 4000, stopOnInteraction: true })
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Why Choose Us</h2>
      </div>
      
      <Carousel
        plugins={[plugin.current]}
        className="w-full"
        onMouseEnter={plugin.current.stop}
        onMouseLeave={plugin.current.reset}
      >
        <CarouselContent className="-ml-1">
          {features.map((feature, index) => (
            <CarouselItem key={index} className="pl-1">
              <Card className="border-0 shadow-xl overflow-hidden relative group">
                <div className={`absolute inset-0 ${feature.gradient} opacity-90`} />
                <div className={`absolute inset-0 ${feature.glassEffect}`} />
                
                <CardContent className="relative p-6 text-white">
                  {/* Decorative elements */}
                  <div className="absolute top-4 right-4 w-20 h-20 bg-white/5 rounded-full blur-2xl" />
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-3xl" />
                  
                  <div className="relative z-10 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 ${feature.iconContainer} rounded-xl flex items-center justify-center shadow-lg backdrop-blur-sm border ${feature.accentColor}`}>
                            <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
                          </div>
                          <h3 className="text-lg font-bold leading-tight">{feature.title}</h3>
                        </div>
                        <p className="text-sm text-white/90 leading-relaxed font-medium">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress dots */}
                    <div className="flex justify-center gap-2 pt-2">
                      {features.map((_, dotIndex) => (
                        <div
                          key={dotIndex}
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            dotIndex === index 
                              ? 'w-8 bg-white shadow-lg' 
                              : 'w-1.5 bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
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