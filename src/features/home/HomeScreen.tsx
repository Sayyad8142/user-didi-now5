import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeHeader } from './HomeHeader';
import { HeroCarousel } from './HeroCarousel';
import { ServicesRow } from './ServicesRow';
import { ServiceHours } from './ServiceHours';
import { FeatureCarousel } from './FeatureCarousel';

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
        <ServiceHours />
        <FeatureCarousel />
      </div>
    </div>;
}