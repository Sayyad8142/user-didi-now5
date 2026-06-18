import React from 'react';
import { Sparkles, BadgeCheck, Gift } from 'lucide-react';
import type { LoyaltyInfo } from '@/features/booking/loyalty';

interface Props {
  basePrice: number;
  info: LoyaltyInfo;
  /** Optional extra line (e.g. slot surge) added to base. */
  extraLineLabel?: string;
  extraLineAmount?: number;
  className?: string;
}

/**
 * Compact price breakdown card.
 *
 *   Base Price ........... ₹100
 *   Slot Surge ........... ₹10        (optional)
 *   Loyalty Charge (+₹20)  ₹20        (or)
 *   First Booking Discount -₹10
 *   ─────────────────────────────
 *   Total Payable ........ ₹130
 */
export function LoyaltyPriceBreakdown({
  basePrice,
  info,
  extraLineLabel,
  extraLineAmount = 0,
  className,
}: Props) {
  const subTotal = Math.max(0, basePrice + (extraLineAmount || 0));
  const total = Math.max(0, subTotal + info.netAdjustment);

  return (
    <div
      className={`rounded-xl border border-border bg-muted/40 p-3 text-sm ${className ?? ''}`}
    >
      <div className="flex justify-between text-foreground">
        <span className="text-muted-foreground">Base price</span>
        <span className="font-medium">₹{basePrice}</span>
      </div>

      {extraLineLabel && extraLineAmount > 0 && (
        <div className="flex justify-between mt-1.5">
          <span className="text-muted-foreground">{extraLineLabel}</span>
          <span className="font-medium">+₹{extraLineAmount}</span>
        </div>
      )}

      {info.loyaltyCharge > 0 && (
        <div className="flex justify-between mt-1.5 text-amber-700">
          <span className="flex items-center gap-1.5">
            <BadgeCheck className="w-3.5 h-3.5" />
            Loyalty charge ({info.tierLabel})
          </span>
          <span className="font-semibold">+₹{info.loyaltyCharge}</span>
        </div>
      )}

      {info.firstBookingDiscount > 0 && (
        <div className="flex justify-between mt-1.5 text-emerald-700">
          <span className="flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5" />
            First booking discount
          </span>
          <span className="font-semibold">-₹{info.firstBookingDiscount}</span>
        </div>
      )}

      <div className="border-t border-border my-2" />

      <div className="flex justify-between items-center">
        <span className="font-semibold text-foreground">Total payable</span>
        <span className="text-lg font-extrabold text-foreground">₹{total}</span>
      </div>
    </div>
  );
}

/**
 * Prominent banner shown on booking screens for the very first booking.
 */
export function FirstBookingBanner({ amount = 10 }: { amount?: number }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/60 p-3.5 flex items-center gap-3 shadow-sm">
      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
        <Sparkles className="w-5 h-5 text-emerald-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-emerald-900 leading-tight">
          🎉 Congratulations!
        </p>
        <p className="text-xs text-emerald-800 mt-0.5">
          You get <span className="font-bold">₹{amount} OFF</span> on your first
          booking — applied automatically at checkout.
        </p>
      </div>
    </div>
  );
}
