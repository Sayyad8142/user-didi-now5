import React, { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const MemoizedSkeleton = memo(Skeleton);

export const OptimizedLoadingCard = memo(() => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
    <div className="p-4 flex justify-between items-center">
      <div>
        <MemoizedSkeleton className="h-6 w-24 mb-1" />
        <MemoizedSkeleton className="h-4 w-16" />
      </div>
      <div className="text-right">
        <MemoizedSkeleton className="h-4 w-20 mb-1" />
        <MemoizedSkeleton className="h-4 w-12" />
      </div>
    </div>
  </div>
));

OptimizedLoadingCard.displayName = 'OptimizedLoadingCard';