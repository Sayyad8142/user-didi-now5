import React, { memo } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { useWalletBalance } from '@/hooks/useWallet';
import { useCommunities } from '@/hooks/useCommunities';
import { Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OptimizedLoadingCard } from '@/components/ui/optimized-loading';
const HomeHeader = memo(() => {
  const { profile, loading } = useProfile();
  const { data: wallet } = useWalletBalance();
  const { communities } = useCommunities();
  const navigate = useNavigate();
  const balance = wallet?.balance_inr ?? 0;

  // Resolve community display name from community_id or slug
  const communityName = (() => {
    if (!profile) return '';
    // Try matching by community_id first, then by slug value
    const match = communities.find(
      c => c.id === profile.community_id || c.value === profile.community
    );
    return match?.name || profile.community || '';
  })();

  if (loading) {
    return <OptimizedLoadingCard />;
  }
  return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-0 mx-0">
      <div className="p-4 flex justify-between items-center gap-4">
        <div className="flex-shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#ff007a] tracking-tight">Didi Now</h1>
          <p className="text-gray-600 text-xs sm:text-sm font-medium mb-1">in 10Mins</p>
          <button
            onClick={() => navigate('/wallet')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"
          >
            <Wallet className="w-3 h-3" />
            ₹{balance}
          </button>
        </div>
        <div className="text-right flex-shrink-0 min-w-0">
          <div className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
            {communityName || '—'}
          </div>
          <div className="text-xs text-gray-500 font-medium">
            {profile?.flat_no || '—'}
          </div>
        </div>
      </div>
    </div>;
});
HomeHeader.displayName = 'HomeHeader';
export { HomeHeader };