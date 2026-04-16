import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function HomeSkeleton() {
  return (
    <div className="min-h-screen gradient-bg pb-24">
      <header className="sticky top-0 z-50 bg-slate-50">
        <div className="max-w-md mx-auto px-4 bg-slate-50">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="p-4 flex justify-between items-center gap-4">
              <div className="flex-shrink-0">
                <h1 className="text-xl sm:text-2xl font-bold text-[#ff007a] tracking-tight">Didi Now</h1>
                <p className="text-gray-600 text-xs sm:text-sm font-medium mb-1">in 10Mins</p>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="text-right flex-shrink-0 min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-28 ml-auto" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-md mx-auto px-4 space-y-4 bg-slate-50 pt-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-48 w-full rounded-3xl" />
      </div>
    </div>
  );
}
