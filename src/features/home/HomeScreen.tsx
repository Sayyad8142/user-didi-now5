import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { HomeHeader } from './HomeHeader';
import { HeroBanner } from './HeroBanner';
import { ServicesRow } from './ServicesRow';
import { ServiceHours } from './ServiceHours';
import { WorkerAvailabilityCard } from './WorkerAvailabilityCard';
import { FeatureCarousel } from './FeatureCarousel';
import { ActiveBookingCard } from './ActiveBookingCard';
import { openExternalUrl } from '@/lib/nativeOpen';
import FaqSection from './FaqSection';

export function HomeScreen() {
  const navigate = useNavigate();

  const handleServiceSelect = (service: 'maid' | 'bathroom_cleaning') => {
    navigate(`/book/${service}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50/80 via-background to-background pb-28 animate-in fade-in duration-500">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/30">
        <div className="max-w-md mx-auto px-4">
          <HomeHeader />
        </div>
      </header>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 space-y-5 pt-4 bg-primary-foreground">
        <HeroBanner />

        <ServicesRow onServiceSelect={handleServiceSelect} />

        <ActiveBookingCard />

        <ServiceHours />

        {/* Call Support */}
        <button
          onClick={() => openExternalUrl('tel:8008180018')}
          className="w-full flex items-center justify-center gap-2.5 h-12 rounded-full border-2 border-primary/20 bg-card text-primary font-semibold text-sm hover:bg-primary/5 active:scale-[0.98] transition-all duration-200">

          <Phone className="w-4 h-4" />
          Call Support
        </button>

        <WorkerAvailabilityCard />
        <FeatureCarousel />
        <FaqSection />
      </div>
    </div>);

}