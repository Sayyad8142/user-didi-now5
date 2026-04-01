import React from 'react';
import { CreditCard, HandCoins, Wallet, Shield, Zap, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PaymentMethod = 'pay_now' | 'pay_after_service';

interface PaymentMethodSelectorProps {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  /** Wallet balance in INR (pass 0 or undefined if no wallet) */
  walletBalance?: number;
  /** Booking amount in INR */
  bookingAmount?: number;
}

export function PaymentMethodSelector({ selected, onChange, disabled, walletBalance = 0, bookingAmount = 0 }: PaymentMethodSelectorProps) {
  const hasWallet = walletBalance > 0;
  const walletCoversAll = hasWallet && walletBalance >= bookingAmount && bookingAmount > 0;
  const walletPartial = hasWallet && !walletCoversAll && bookingAmount > 0;
  const remainingAmount = walletPartial ? bookingAmount - walletBalance : 0;

  return (
    <div className="space-y-3">
      {/* Wallet auto-apply banner */}
      {hasWallet && bookingAmount > 0 && (
        <div className={cn(
          "flex items-center gap-2.5 rounded-xl px-3 py-2.5 border",
          walletCoversAll
            ? "bg-emerald-50 border-emerald-200"
            : "bg-amber-50 border-amber-200"
        )}>
          <Wallet className={cn(
            "w-4 h-4 shrink-0",
            walletCoversAll ? "text-emerald-600" : "text-amber-600"
          )} />
          <div className="flex-1 min-w-0">
            {walletCoversAll ? (
              <p className="text-xs text-emerald-800">
                <span className="font-semibold">₹{walletBalance}</span> wallet balance covers full payment!
              </p>
            ) : (
              <p className="text-xs text-amber-800">
                <span className="font-semibold">₹{walletBalance}</span> from wallet applied automatically.{' '}
                You pay only <span className="font-semibold">₹{remainingAmount}</span>.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Pay Now — primary / recommended */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('pay_now')}
        className={cn(
          "relative w-full flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 transition-all text-left",
          selected === 'pay_now'
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border bg-card hover:border-primary/40",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        {/* Recommended badge */}
        <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
          <Zap className="w-3 h-3" /> Recommended
        </span>

        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
          selected === 'pay_now' ? "bg-primary/15" : "bg-muted"
        )}>
          {walletCoversAll ? (
            <Wallet className={cn("w-5 h-5", selected === 'pay_now' ? "text-primary" : "text-muted-foreground")} />
          ) : (
            <Smartphone className={cn("w-5 h-5", selected === 'pay_now' ? "text-primary" : "text-muted-foreground")} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className={cn(
            "text-sm font-bold leading-tight",
            selected === 'pay_now' ? "text-primary" : "text-foreground"
          )}>
            {walletCoversAll ? 'Pay with Wallet' : 'Pay Now — UPI / Card'}
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            {walletCoversAll
              ? `₹${bookingAmount} from wallet • instant confirmation`
              : walletPartial
                ? `₹${walletBalance} wallet + ₹${remainingAmount} via PhonePe / GPay / Card`
                : 'PhonePe, Google Pay, Paytm & more'}
          </p>
          <div className="flex items-center gap-2.5 mt-1.5">
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
              <Zap className="w-3 h-3" /> Fastest confirmation
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground font-medium">
              <Shield className="w-3 h-3" /> Secure
            </span>
          </div>
        </div>

        {/* Radio indicator */}
        <div className={cn(
          "w-5 h-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center",
          selected === 'pay_now' ? "border-primary" : "border-muted-foreground/30"
        )}>
          {selected === 'pay_now' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
        </div>
      </button>

      {/* Pay After Service */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('pay_after_service')}
        className={cn(
          "relative w-full flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 transition-all text-left",
          selected === 'pay_after_service'
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border bg-card hover:border-primary/40",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
          selected === 'pay_after_service' ? "bg-primary/15" : "bg-muted"
        )}>
          <HandCoins className={cn("w-5 h-5", selected === 'pay_after_service' ? "text-primary" : "text-muted-foreground")} />
        </div>

        <div className="flex-1 min-w-0">
          <span className={cn(
            "text-sm font-bold leading-tight",
            selected === 'pay_after_service' ? "text-primary" : "text-foreground"
          )}>
            Pay After Service
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Cash or UPI directly to worker after service
          </p>
        </div>

        <div className={cn(
          "w-5 h-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center",
          selected === 'pay_after_service' ? "border-primary" : "border-muted-foreground/30"
        )}>
          {selected === 'pay_after_service' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
        </div>
      </button>

      {/* Trust footer */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Shield className="w-3 h-3" /> 100% Secure
        </span>
        <span className="text-muted-foreground/30">•</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Zap className="w-3 h-3" /> Instant Booking
        </span>
      </div>
    </div>
  );
}
