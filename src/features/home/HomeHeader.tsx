import React, { memo } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { OptimizedLoadingCard } from '@/components/ui/optimized-loading';
import { MapPin } from 'lucide-react';

const HomeHeader = memo(() => {
  const { profile, loading } = useProfile();

  if (loading) {
    return <OptimizedLoadingCard />;
  }

  return (
    <div className="py-3 flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-extrabold text-primary tracking-tight leading-none">
          Didi Now
        </h1>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">in 10 mins</p>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/60 shadow-sm">
        <MapPin className="w-3.5 h-3.5 text-primary" />
        <div className="text-right">
          <div className="text-xs font-semibold text-foreground leading-tight truncate max-w-[140px]">
            {profile?.community || "Prestige High Fields"}
          </div>
          <div className="text-[10px] text-muted-foreground font-medium">
            Flat {profile?.flat_no || "9899"}
          </div>
        </div>
      </div>
    </div>
  );
});

HomeHeader.displayName = 'HomeHeader';
export { HomeHeader };
