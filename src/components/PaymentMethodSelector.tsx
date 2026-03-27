import React from 'react';
import { CreditCard, HandCoins, Wallet } from 'lucide-react';
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
  const walletPartial = hasWallet && !walletCoversAll;
  const remainingAmount = walletPartial ? bookingAmount - walletBalance : 0;

  return (
    <div className="space-y-3">
      {/* Wallet info banner */}
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
                <span className="font-semibold">₹{walletBalance}</span> in wallet — covers full payment!
              </p>
            ) : (
              <p className="text-xs text-amber-800">
                <span className="font-semibold">₹{walletBalance}</span> wallet balance will be used.{' '}
                Pay <span className="font-semibold">₹{remainingAmount}</span> via Razorpay.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('pay_now')}
          className={cn(
            "relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 transition-all",
            selected === 'pay_now'
              ? "border-primary bg-primary/8 ring-1 ring-primary/30"
              : "border-border bg-card hover:border-primary/40",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          {walletCoversAll ? (
            <Wallet className={cn(
              "w-5 h-5",
              selected === 'pay_now' ? "text-primary" : "text-muted-foreground"
            )} />
          ) : (
            <CreditCard className={cn(
              "w-5 h-5",
              selected === 'pay_now' ? "text-primary" : "text-muted-foreground"
            )} />
          )}
          <span className={cn(
            "text-xs font-semibold leading-tight text-center",
            selected === 'pay_now' ? "text-primary" : "text-foreground"
          )}>
            {walletCoversAll ? 'Pay with Wallet' : 'Pay Now'}
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight text-center">
            {walletCoversAll
              ? `₹${bookingAmount} from wallet`
              : walletPartial
                ? `₹${walletBalance} wallet + ₹${remainingAmount} online`
                : 'Online payment'}
          </span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('pay_after_service')}
          className={cn(
            "relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 transition-all",
            selected === 'pay_after_service'
              ? "border-primary bg-primary/8 ring-1 ring-primary/30"
              : "border-border bg-card hover:border-primary/40",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          <HandCoins className={cn(
            "w-5 h-5",
            selected === 'pay_after_service' ? "text-primary" : "text-muted-foreground"
          )} />
          <span className={cn(
            "text-xs font-semibold leading-tight text-center",
            selected === 'pay_after_service' ? "text-primary" : "text-foreground"
          )}>
            Pay After Service
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight text-center">
            Cash / UPI later
          </span>
        </button>
      </div>
    </div>
  );
}
