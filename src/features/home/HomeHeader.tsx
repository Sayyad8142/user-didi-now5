import React, { memo } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { useWalletBalance } from '@/hooks/useWallet';
import { Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OptimizedLoadingCard } from '@/components/ui/optimized-loading';
const HomeHeader = memo(() => {
  const { profile, loading } = useProfile();
  const { data: wallet } = useWalletBalance();
  const navigate = useNavigate();
  const balance = wallet?.balance_inr ?? 0;
  if (loading) {
    return <OptimizedLoadingCard />;
  }
  return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-0 mx-0">
      <div className="p-4 flex justify-between items-center gap-4">
        <div className="flex-shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#ff007a] tracking-tight">Didi Now</h1>
          <p className="text-gray-600 text-xs sm:text-sm font-medium">in 10Mins</p>
          <button
            onClick={() => navigate('/wallet')}
            className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"
          >
            <Wallet className="w-3 h-3" />
            ₹{balance}
          </button>
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
    </div>;
});
HomeHeader.displayName = 'HomeHeader';
export { HomeHeader };