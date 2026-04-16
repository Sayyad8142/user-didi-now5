import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, Star } from 'lucide-react';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';
import { HomeHeader } from './HomeHeader';
import { HeroCarousel } from './HeroCarousel';
import { ServicesRow } from './ServicesRow';
import { ServiceHours } from './ServiceHours';
import { WorkerAvailabilityCard } from './WorkerAvailabilityCard';
import { FeatureCarousel } from './FeatureCarousel';
import { ActiveBookingCard } from './ActiveBookingCard';
import { openExternalUrl } from '@/lib/nativeOpen';
import FaqSection from './FaqSection';
import { useOnlineWorkerCounts } from '@/hooks/useOnlineWorkerCounts';
import { useUnratedBooking } from '@/hooks/useUnratedBooking';
import { MandatoryRatingScreen } from '@/features/bookings/MandatoryRatingScreen';
import { useProfile } from '@/contexts/ProfileContext';
import { HomeSkeleton } from './HomeSkeleton';


export function HomeScreen() {
  const navigate = useNavigate();
  const { profile, loading: profileLoading } = useProfile();
  const { hasUnseenMessages, markMessagesAsSeen } = useUnseenMessages();
  const { counts, loading, isServiceAvailable } = useOnlineWorkerCounts();
  const { unratedBooking, hasUnratedBooking, invalidate: refreshUnrated } = useUnratedBooking();
  const [ratingDismissed, setRatingDismissed] = useState(false);

  console.log('[HomeScreen] mounted, profile:', profile?.id, 'community:', profile?.community);

  // Wait for profile before rendering any partial UI
  if (profileLoading || !profile) {
    return <HomeSkeleton />;
  }

  const handleServiceSelect = (service: 'maid' | 'bathroom_cleaning') => {
    navigate(`/book/${service}`);
  };

  return <div className="min-h-screen gradient-bg pb-24">
      {/* Mandatory rating popup */}
      {unratedBooking && !ratingDismissed && (
        <MandatoryRatingScreen
          booking={unratedBooking}
          onRated={() => { setRatingDismissed(true); refreshUnrated(); }}
          onDismiss={() => setRatingDismissed(true)}
        />
      )}

      <header className="sticky top-0 z-50 bg-slate-50">
        <div className="max-w-md mx-auto px-4 bg-slate-50">
          <HomeHeader />
        </div>
      </header>
      <div className="max-w-md mx-auto px-4 space-y-4 bg-slate-50">
        <HeroCarousel />
        <ServicesRow onServiceSelect={handleServiceSelect} />
        <ActiveBookingCard />
        
        <ServiceHours />
        
        {/* Contact Manager & Support Buttons */}
        <div className="space-y-3">
          <Button onClick={() => openExternalUrl('tel:8008180018')} variant="outline" className="w-full h-12 rounded-full border-2 border-primary/20 bg-white/90 hover:bg-primary/5 text-primary font-semibold transition-spring hover:scale-[1.02] flex items-center justify-center gap-3">
            <Phone className="w-5 h-5" />
            <span>Call Manager</span>
          </Button>
          
          <Button onClick={() => {
            markMessagesAsSeen();
            navigate('/chat');
          }} className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] flex items-center justify-center gap-3 relative">
            <MessageCircle className="w-5 h-5" />
            <span className="font-semibold">Chat Support</span>
            {hasUnseenMessages && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </Button>
        </div>
        
        <WorkerAvailabilityCard counts={counts} loading={loading} />
        <FeatureCarousel />

        <FaqSection />
      </div>
    </div>;
}
