import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, Trophy, Star, Sparkles } from 'lucide-react';
import { useLoyalty } from '@/hooks/useLoyalty';
import type { LoyaltyTier } from '@/features/booking/loyalty';

const TIER_STYLES: Record<LoyaltyTier, { ring: string; bg: string; text: string; Icon: typeof Star }> = {
  new:     { ring: 'border-sky-200',    bg: 'bg-sky-50',     text: 'text-sky-700',     Icon: Sparkles },
  regular: { ring: 'border-emerald-200',bg: 'bg-emerald-50', text: 'text-emerald-700', Icon: Star },
  silver:  { ring: 'border-slate-300',  bg: 'bg-slate-50',   text: 'text-slate-700',   Icon: Award },
  gold:    { ring: 'border-amber-300',  bg: 'bg-amber-50',   text: 'text-amber-700',   Icon: Trophy },
};

export function LoyaltyCard() {
  const { count, info, isLoading } = useLoyalty();
  const s = TIER_STYLES[info.tier];
  const Icon = s.Icon;

  return (
    <div className={`rounded-2xl border ${s.ring} ${s.bg} p-4 shadow-sm`}>
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl bg-white/70 flex items-center justify-center ${s.text}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
            🏅 Loyalty Level
          </p>
          {isLoading ? (
            <Skeleton className="h-5 w-32 mt-1" />
          ) : (
            <p className={`text-base font-bold ${s.text}`}>
              {info.tierLabel}
              {info.loyaltyCharge > 0 && (
                <span className="text-xs font-semibold ml-1.5 opacity-80">
                  (+₹{info.loyaltyCharge})
                </span>
              )}
              {info.firstBookingDiscount > 0 && (
                <span className="text-xs font-semibold ml-1.5 text-emerald-700">
                  · ₹{info.firstBookingDiscount} off first booking
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/80 p-2">
          <p className="text-[10px] text-gray-500 uppercase">Completed</p>
          <p className="text-base font-bold text-gray-900">{count}</p>
        </div>
        <div className="rounded-xl bg-white/80 p-2">
          <p className="text-[10px] text-gray-500 uppercase">Current Tier</p>
          <p className="text-sm font-bold text-gray-900">{info.tierLabel.split(' ')[0]}</p>
        </div>
        <div className="rounded-xl bg-white/80 p-2">
          <p className="text-[10px] text-gray-500 uppercase">Next Tier</p>
          {info.nextTierAt != null ? (
            <p className="text-sm font-bold text-gray-900">
              {info.bookingsToNextTier} to go
            </p>
          ) : (
            <p className="text-sm font-bold text-amber-700">Top tier 🏆</p>
          )}
        </div>
      </div>

      {info.nextTierAt != null && info.nextTierLabel && (
        <p className="mt-2 text-[11px] text-gray-600 text-center">
          {info.bookingsToNextTier === 0 ? 'You reach' : `Reach`}{' '}
          <span className="font-semibold">{info.nextTierLabel}</span> at{' '}
          <span className="font-semibold">{info.nextTierAt} bookings</span>
          {info.nextTierCharge != null && (
            <span className="text-gray-400"> (+₹{info.nextTierCharge})</span>
          )}
        </p>
      )}
    </div>
  );
}
