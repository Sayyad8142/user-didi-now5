import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle } from 'lucide-react';
import { HomeHeader } from './HomeHeader';
import { HeroCarousel } from './HeroCarousel';
import { ServicesRow } from './ServicesRow';
import { ServiceHours } from './ServiceHours';
import { FeatureCarousel } from './FeatureCarousel';
import { ActiveBookingCard } from './ActiveBookingCard';
import { openExternalUrl } from '@/lib/nativeOpen';
import FaqSection from './FaqSection';

export function HomeScreen() {
  const navigate = useNavigate();

  const handleServiceSelect = (service: 'maid' | 'cook' | 'bathroom_cleaning') => {
    navigate(`/book/${service}`);
  };
  return <div className="min-h-screen gradient-bg pb-24">
      <div className="max-w-md mx-auto px-4 py-3 space-y-4 bg-slate-50">
        <HomeHeader />
        <HeroCarousel />
        <ServicesRow onServiceSelect={handleServiceSelect} />
        <ActiveBookingCard />
        <ServiceHours />
        <FeatureCarousel />
        
        {/* Promotional Banner */}
        <div className="px-2">
          <img 
            src="/lovable-uploads/a157d599-7225-4729-88f2-e0a3d7500d7b.png" 
            alt="Didi Now - Quick maid service in 10 minutes"
            className="w-full object-contain rounded-lg shadow-sm"
          />
        </div>
        
        {/* Contact Manager Button */}
        <div className="pt-4 space-y-3">
          <Button
            onClick={() => openExternalUrl('tel:8008180018')}
            className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] flex items-center justify-center gap-3"
          >
            <Phone className="w-5 h-5" />
            <span className="font-semibold">Call Manger</span>
          </Button>
          
          <Button
            onClick={() => navigate('/chat')}
            variant="outline"
            className="w-full h-12 rounded-full border-2 border-primary/20 bg-white/90 hover:bg-primary/5 text-primary font-semibold transition-spring hover:scale-[1.02] flex items-center justify-center gap-3"
          >
            <MessageCircle className="w-5 h-5" />
            <span>Chat Support</span>
          </Button>
        </div>

        <FaqSection />
      </div>
    </div>;
}