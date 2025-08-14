import React, { useState } from 'react';
import { HomeHeader } from './HomeHeader';
import { HeroCarousel } from './HeroCarousel';
import { ServicesRow } from './ServicesRow';
import { ServiceHours } from './ServiceHours';
import { CommunityWorkersCard } from './CommunityWorkersCard';
import { ChooseTypeSheet } from './ChooseTypeSheet';
export function HomeScreen() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<'maid' | 'cook' | 'bathroom_cleaning' | null>(null);
  const handleServiceSelect = (service: 'maid' | 'cook' | 'bathroom_cleaning') => {
    setSelectedService(service);
    setSheetOpen(true);
  };
  return <div className="min-h-screen gradient-bg pb-24">
      <div className="max-w-md mx-auto px-4 py-3 space-y-4 bg-slate-50">
        <HomeHeader />
        <HeroCarousel />
        <ServicesRow onServiceSelect={handleServiceSelect} />
        <ServiceHours />
        <CommunityWorkersCard onServiceSelect={handleServiceSelect} />
      </div>

      <ChooseTypeSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} service={selectedService} />
    </div>;
}