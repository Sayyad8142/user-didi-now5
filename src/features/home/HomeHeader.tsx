import React, { memo } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { OptimizedLoadingCard } from '@/components/ui/optimized-loading';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const HomeHeader = memo(() => {
  const { profile, loading } = useProfile();
  const { balance, isLoading: walletLoading } = useWalletBalance();

  if (loading) {
    return <OptimizedLoadingCard />;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-0 mx-0">
      <div className="p-4 flex justify-between items-center gap-4">
        <div className="flex-shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#ff007a] tracking-tight">Didi Now</h1>
          <p className="text-gray-600 text-xs sm:text-sm font-medium">in 10Mins</p>
        </div>
        
        {/* Wallet Balance */}
        <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl px-3 py-2">
          <div className="h-8 w-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white/80 text-[10px] font-medium uppercase tracking-wide">Wallet</p>
            {walletLoading ? (
              <Skeleton className="h-5 w-12 bg-white/20 rounded" />
            ) : (
              <p className="text-lg font-bold text-white">₹{balance}</p>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0 min-w-0">
          <div className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
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