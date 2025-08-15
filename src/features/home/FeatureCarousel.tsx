import React from 'react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Award, Headphones, Star, Sparkles } from 'lucide-react';
import Autoplay from 'embla-carousel-autoplay';
const features = [{
  title: 'Verified Experts',
  description: 'With valid ID proof & a spotless background for your peace of mind',
  icon: Shield,
  bgGradient: 'bg-gradient-to-r from-gray-50 to-blue-50',
  iconBg: 'bg-gradient-to-br from-blue-400 to-blue-600',
  iconShadow: 'shadow-blue-200'
}, {
  title: 'Trained Professional',
  description: 'Equipped with the latest best practices to deliver top-notch services',
  icon: Award,
  bgGradient: 'bg-gradient-to-r from-gray-50 to-emerald-50',
  iconBg: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
  iconShadow: 'shadow-emerald-200'
}, {
  title: 'Dedicated Support',
  description: 'Always ready to ensure quick resolutions and a hassle-free experience',
  icon: Headphones,
  bgGradient: 'bg-gradient-to-r from-gray-50 to-cyan-50',
  iconBg: 'bg-gradient-to-br from-cyan-400 to-cyan-600',
  iconShadow: 'shadow-cyan-200'
}, {
  title: 'We Value Your Feedback',
  description: 'Your reviews help us consistently monitor and enhance performance',
  icon: Star,
  bgGradient: 'bg-gradient-to-r from-gray-50 to-amber-50',
  iconBg: 'bg-gradient-to-br from-amber-400 to-amber-600',
  iconShadow: 'shadow-amber-200'
}];
export function FeatureCarousel() {
  const plugin = React.useRef(Autoplay({
    delay: 4000,
    stopOnInteraction: true
  }));
  return <div className="w-full space-y-3">
      
      
      <Carousel plugins={[plugin.current]} className="w-full" onMouseEnter={plugin.current.stop} onMouseLeave={plugin.current.reset}>
        <CarouselContent className="-ml-1">
          {features.map((feature, index) => <CarouselItem key={index} className="pl-1">
              <Card className="border-0 shadow-sm bg-white/80 backdrop-blur-sm overflow-hidden">
                <CardContent className={`p-6 ${feature.bgGradient} relative`}>
                  <div className="flex items-center justify-between gap-6">
                    {/* Text Content */}
                    <div className="flex-1 space-y-3">
                      <h3 className="text-xl font-bold text-gray-900 leading-tight">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                    
                    {/* 3D Icon */}
                    <div className="relative shrink-0">
                      <div className={`w-24 h-24 ${feature.iconBg} rounded-2xl flex items-center justify-center ${feature.iconShadow} shadow-2xl relative transform rotate-3 hover:rotate-0 transition-transform duration-300`}>
                        {/* Inner glow effect */}
                        <div className="absolute inset-2 bg-white/20 rounded-xl" />
                        <feature.icon className="w-10 h-10 text-white relative z-10" />
                        
                        {/* Highlight effect */}
                        <div className="absolute top-2 left-2 w-4 h-4 bg-white/40 rounded-full blur-sm" />
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress dots */}
                  <div className="flex justify-center gap-2 mt-6">
                    {features.map((_, dotIndex) => <div key={dotIndex} className={`h-2 rounded-full transition-all duration-500 ${dotIndex === index ? 'w-8 bg-gray-400' : 'w-2 bg-gray-300'}`} />)}
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>)}
        </CarouselContent>
      </Carousel>
    </div>;
}