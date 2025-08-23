import React from 'react';
import { HomeScreen } from '@/features/home/HomeScreen';
import { AppFooter } from '@/components/AppFooter';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <HomeScreen />
      <AppFooter />
    </div>
  );
}