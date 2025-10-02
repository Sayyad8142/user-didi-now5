import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, Shield } from 'lucide-react';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';
import { useBookingsEnabled } from '@/hooks/useBookingsEnabled';
import { HomeHeader } from './HomeHeader';
import { HeroCarousel } from './HeroCarousel';
import { ServicesRow } from './ServicesRow';
import { ServiceHours } from './ServiceHours';
import { FeatureCarousel } from './FeatureCarousel';
import { ActiveBookingCard } from './ActiveBookingCard';
import { HolidayBanner } from './HolidayBanner';
import { openExternalUrl } from '@/lib/nativeOpen';
import FaqSection from './FaqSection';
export function HomeScreen() {
  const navigate = useNavigate();
  const { hasUnseenMessages, markMessagesAsSeen } = useUnseenMessages();
  const { data: bookingsSettings } = useBookingsEnabled();
  
  const handleServiceSelect = (service: 'maid' | 'cook' | 'bathroom_cleaning') => {
    if (bookingsSettings?.enabled) {
      navigate(`/book/${service}`);
    }
  };
  return <div className="min-h-screen gradient-bg pb-24">
      <header className="sticky top-0 z-50 bg-slate-50">
        <div className="max-w-md mx-auto px-4 bg-slate-50">
          <HomeHeader />
        </div>
      </header>
      <div className="max-w-md mx-auto px-4 space-y-4 bg-slate-50">
        <HeroCarousel />
        {!bookingsSettings?.enabled && bookingsSettings?.message && (
          <HolidayBanner message={bookingsSettings.message} />
        )}
        <ServicesRow 
          onServiceSelect={handleServiceSelect} 
          disabled={!bookingsSettings?.enabled}
        />
        <ActiveBookingCard />
        <ServiceHours />
        <FeatureCarousel />
        
        {/* Promotional Banner */}
        <div className="px-2">
          
        </div>
        
        {/* Contact Manager Button */}
        <div className="pt-4 space-y-3">
          <Button onClick={() => openExternalUrl('tel:8008180018')} className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] flex items-center justify-center gap-3">
            <Phone className="w-5 h-5" />
            <span className="font-semibold">Call Manger</span>
          </Button>
          
          <Button onClick={() => {
            markMessagesAsSeen();
            navigate('/chat');
          }} variant="outline" className="w-full h-12 rounded-full border-2 border-primary/20 bg-white/90 hover:bg-primary/5 text-primary font-semibold transition-spring hover:scale-[1.02] flex items-center justify-center gap-3 relative">
            <MessageCircle className="w-5 h-5" />
            <span>Chat Support</span>
            {hasUnseenMessages && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </Button>
          
          {/* Legal Links */}
          
        </div>

        <FaqSection />
      </div>
    </div>;
}