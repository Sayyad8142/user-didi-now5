import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';
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
        
        {/* Contact Manager Button */}
        <div className="pt-4">
          <Button
            onClick={() => openExternalUrl('tel:8008180018')}
            className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] flex items-center justify-center gap-3"
          >
            <Phone className="w-5 h-5" />
            <span className="font-semibold">Contact Manager</span>
          </Button>
        </div>

        <FaqSection />
      </div>
    </div>;
}