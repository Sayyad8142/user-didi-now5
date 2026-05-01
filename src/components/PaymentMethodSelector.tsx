import React from 'react';
import { CreditCard, HandCoins, Wallet, Shield, Zap, Smartphone, Smartphone as PhoneIcon } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { isNativeApp } from '@/utils/platform';

export type PaymentMethod = 'pay_now' | 'pay_after_service' | 'wallet';

interface PaymentMethodSelectorProps {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  /** Wallet balance in INR (pass 0 or undefined if no wallet) */
  walletBalance?: number;
  /** Booking amount in INR */
  bookingAmount?: number;
}

import { usePayAfterServiceEnabled, useDisableOnlinePayments } from '@/hooks/useAppConfigFlags';

export function PaymentMethodSelector({ selected, onChange, disabled, walletBalance = 0, bookingAmount = 0 }: PaymentMethodSelectorProps) {
  const isNative = isNativeApp();
  const codOnly = useDisableOnlinePayments();
  const payNowDisabled = !isNative || codOnly; // Pay Now only works in native app, and never in COD-only mode
  const enablePayAfterService = usePayAfterServiceEnabled();
  // In COD-only mode, Pay After Service is the ONLY option (force visible regardless of admin flag).
  const shouldShowPayAfterService = codOnly || enablePayAfterService;
  const payAfterEnabled = shouldShowPayAfterService;
  const walletCoversAll = !codOnly && walletBalance > 0 && walletBalance >= bookingAmount && bookingAmount > 0;
  const walletPartial = !codOnly && walletBalance > 0 && !walletCoversAll && bookingAmount > 0;
  const remainingAmount = walletPartial ? bookingAmount - walletBalance : 0;
  const walletEmpty = walletBalance <= 0;

  console.log('Pay After Service visibility debug', {
    enable_pay_after_service: enablePayAfterService,
    disable_online_payments: codOnly,
    isNativeApp: isNative,
    platform: Capacitor.getPlatform?.(),
    shouldShowPayAfterService,
  });

  // COD-only: force pay_after_service selection.
  React.useEffect(() => {
    if (codOnly && selected !== 'pay_after_service') {
      onChange('pay_after_service');
    }
  }, [codOnly, selected, onChange]);

  // Auto-select wallet if it covers full amount (skip in COD-only mode)
  React.useEffect(() => {
    if (!codOnly && walletCoversAll && selected !== 'wallet') {
      onChange('wallet');
    }
  }, [codOnly, walletCoversAll, selected, onChange]);

  // If user is on web (Pay Now disabled) and currently selected pay_now, switch to a valid option.
  // Web: fall back to pay_after_service when admin enabled it.
  React.useEffect(() => {
    if (payNowDisabled && selected === 'pay_now') {
      if (walletCoversAll) {
        onChange('wallet');
      } else if (payAfterEnabled) {
        onChange('pay_after_service');
      }
    }
  }, [payNowDisabled, selected, walletCoversAll, payAfterEnabled, onChange]);

  // If currently selected pay_after_service but it's no longer available,
  // switch to wallet (if covers) else pay_now.
  React.useEffect(() => {
    if (!payAfterEnabled && selected === 'pay_after_service') {
      onChange(walletCoversAll ? 'wallet' : 'pay_now');
    }
  }, [payAfterEnabled, selected, walletCoversAll, onChange]);

  // ── COD-only mode: render ONLY Pay After Service ──
  if (codOnly) {
    return (
      <div className="space-y-3">
        <div
          className="relative w-full flex items-start gap-3 rounded-2xl border-2 border-primary bg-primary/5 ring-1 ring-primary/30 px-4 py-3.5 text-left"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-primary/15">
            <HandCoins className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold leading-tight text-primary">
              Pay After Service (Cash)
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Pay in cash directly to the worker after the service is done.
            </p>
          </div>
          <div className="w-5 h-5 rounded-full border-2 border-primary shrink-0 mt-1 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          </div>
        </div>
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

  return (
    <div className="space-y-3">
      {/* Wallet Pay — always visible */}
      <button
        type="button"
        disabled={disabled || !walletCoversAll}
        onClick={() => onChange('wallet')}
        className={cn(
          "relative w-full flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 transition-all text-left",
          selected === 'wallet'
            ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300"
            : "border-border bg-card",
          walletCoversAll && selected !== 'wallet' && "hover:border-emerald-400",
          !walletCoversAll && "opacity-60"
        )}
      >
        {walletCoversAll && (
          <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            <Wallet className="w-3 h-3" /> Best Option
          </span>
        )}

        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
          selected === 'wallet' ? "bg-emerald-100" : "bg-muted"
        )}>
          <Wallet className={cn("w-5 h-5", selected === 'wallet' ? "text-emerald-600" : "text-muted-foreground")} />
        </div>

        <div className="flex-1 min-w-0">
          <span className={cn(
            "text-sm font-bold leading-tight",
            selected === 'wallet' ? "text-emerald-700" : "text-foreground"
          )}>
            Pay with Wallet
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            {walletCoversAll
              ? <>Balance: <span className="font-semibold text-emerald-600">₹{walletBalance}</span> — covers full ₹{bookingAmount}</>
              : walletPartial
                ? <>Balance: <span className="font-semibold">₹{walletBalance}</span> — need ₹{bookingAmount} (insufficient)</>
                : <>Wallet Balance: <span className="font-semibold">₹0</span></>
            }
          </p>
          {walletCoversAll && (
            <div className="flex items-center gap-2.5 mt-1.5">
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
                <Zap className="w-3 h-3" /> Instant • No payment app needed
              </span>
            </div>
          )}
          {walletEmpty && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Refunds from cancelled bookings appear here
            </p>
          )}
        </div>

        <div className={cn(
          "w-5 h-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center",
          selected === 'wallet' ? "border-emerald-500" : "border-muted-foreground/30"
        )}>
          {selected === 'wallet' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
        </div>
      </button>

      {/* Wallet partial info banner */}
      {walletPartial && selected === 'pay_now' && (
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 border bg-amber-50 border-amber-200">
          <Wallet className="w-4 h-4 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">₹{walletBalance}</span> from wallet applied automatically.{' '}
            You pay only <span className="font-semibold">₹{remainingAmount}</span>.
          </p>
        </div>
      )}

      {/* Pay Now — UPI / Card (native app only) */}
      <button
        type="button"
        disabled={disabled || payNowDisabled}
        onClick={() => !payNowDisabled && onChange('pay_now')}
        className={cn(
          "relative w-full flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 transition-all text-left",
          selected === 'pay_now'
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border bg-card",
          !payNowDisabled && selected !== 'pay_now' && "hover:border-primary/40",
          (disabled || payNowDisabled) && "opacity-60 cursor-not-allowed"
        )}
      >
        {!walletCoversAll && !payNowDisabled && (
          <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
            <Zap className="w-3 h-3" /> Recommended
          </span>
        )}
        {payNowDisabled && (
          <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 bg-muted text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-full border border-border">
            <PhoneIcon className="w-3 h-3" /> App only
          </span>
        )}

        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
          selected === 'pay_now' ? "bg-primary/15" : "bg-muted"
        )}>
          <Smartphone className={cn("w-5 h-5", selected === 'pay_now' ? "text-primary" : "text-muted-foreground")} />
        </div>

        <div className="flex-1 min-w-0">
          <span className={cn(
            "text-sm font-bold leading-tight",
            selected === 'pay_now' ? "text-primary" : "text-foreground"
          )}>
            Pay Now — UPI / Card
          </span>
          {payNowDisabled ? (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Available only on our mobile app. Please install the app to pay online.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {walletPartial
                  ? <>₹{walletBalance} wallet + ₹{remainingAmount} via PhonePe / GPay / Card</>
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
            </>
          )}
        </div>

        <div className={cn(
          "w-5 h-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center",
          selected === 'pay_now' ? "border-primary" : "border-muted-foreground/30"
        )}>
          {selected === 'pay_now' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
        </div>
      </button>

      {/* Pay After Service — admin controlled */}
      {payAfterEnabled && (
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
      )}

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