import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile } from '@/features/profile/useProfile';

export function HomeHeader() {
  const { profile, loading } = useProfile();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-4 flex justify-between items-center">
          <div>
            <Skeleton className="h-6 w-24 mb-1" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="text-right">
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>
    );
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
}