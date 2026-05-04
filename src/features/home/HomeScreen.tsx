import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, Star, RefreshCw, AlertCircle } from 'lucide-react';
import { useUnseenMessages } from '@/hooks/useUnseenMessages';
import { HomeHeader } from './HomeHeader';
import { HeroCarousel } from './HeroCarousel';
import { ServicesRow } from './ServicesRow';
import { ServiceHours } from './ServiceHours';
import { WorkerAvailabilityCard } from './WorkerAvailabilityCard';
import { FeatureCarousel } from './FeatureCarousel';
import { ActiveBookingCard } from './ActiveBookingCard';
import { HomeOtpCard } from './HomeOtpCard';
import { openExternalUrl } from '@/lib/nativeOpen';
import FaqSection from './FaqSection';
import { TrustedPartnersSection } from './TrustedPartnersSection';
import { useOnlineWorkerCounts } from '@/hooks/useOnlineWorkerCounts';
import { useProfile } from '@/contexts/ProfileContext';
import { HomeSkeleton } from './HomeSkeleton';


export function HomeScreen() {
  const navigate = useNavigate();
  const { profile, loading: profileLoading, error: profileError, refresh } = useProfile();
  const { hasUnseenMessages, markMessagesAsSeen } = useUnseenMessages();
  const { counts, loading, isServiceAvailable } = useOnlineWorkerCounts();

  // Show friendly fallback if profile takes too long (>10s) or hard-errors
  const [softTimeout, setSoftTimeout] = useState(false);
  useEffect(() => {
    if (!profileLoading || profile) return;
    const t = setTimeout(() => setSoftTimeout(true), 10000);
    return () => clearTimeout(t);
  }, [profileLoading, profile]);

  console.log('[HomeScreen] mounted, profile:', profile?.id, 'community:', profile?.community);

  // Hard error or timed-out skeleton → friendly retry instead of infinite loading
  if (!profile && (profileError || softTimeout)) {
    return (
      <div className="min-h-screen gradient-bg flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-5">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Couldn't load your profile</h1>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          {profileError || 'This is taking longer than usual. Please check your connection and try again.'}
        </p>
        <div className="flex gap-3 w-full max-w-xs">
          <Button onClick={() => { setSoftTimeout(false); refresh(); }} className="flex-1 gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()} className="flex-1">
            Reload App
          </Button>
        </div>
      </div>
    );
  }

  // Wait for profile before rendering any partial UI
  if (profileLoading || !profile) {
    return <HomeSkeleton />;
  }

  const handleServiceSelect = (service: 'maid' | 'bathroom_cleaning') => {
    navigate(`/book/${service}`);
  };

  return <div className="min-h-screen gradient-bg pb-24">
      <header className="sticky top-0 z-50 bg-slate-50">
        <div className="max-w-md mx-auto px-4 bg-slate-50">
          <HomeHeader />
        </div>
      </header>
      <div className="max-w-md mx-auto px-4 space-y-4 bg-slate-50">
        <HeroCarousel />
        <ServicesRow onServiceSelect={handleServiceSelect} />
        <HomeOtpCard />
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
        
        <WorkerAvailabilityCard counts={counts} loading={loading} onServiceSelect={handleServiceSelect} />
        <FeatureCarousel />

        <FaqSection />

        <TrustedPartnersSection />
      </div>
    </div>;
}
