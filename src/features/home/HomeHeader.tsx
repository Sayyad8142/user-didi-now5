import React, { memo } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { OptimizedLoadingCard } from '@/components/ui/optimized-loading';

const HomeHeader = memo(() => {
  const { profile, loading } = useProfile();

  if (loading) {
    return <OptimizedLoadingCard />;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#ff007a] tracking-tight">Didi Now</h1>
          <p className="text-gray-600 text-sm font-medium">in 10Mins</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-900">
            {profile?.community || "Prestige High Fields"}
          </div>
          <div className="text-xs text-gray-500 font-medium">
            {profile?.flat_no || "9899"}
          </div>
        </div>
      </div>
    </div>
  );
});

HomeHeader.displayName = 'HomeHeader';

export { HomeHeader };