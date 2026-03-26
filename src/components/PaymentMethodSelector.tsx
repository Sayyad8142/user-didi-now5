import React from 'react';
import { CreditCard, HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PaymentMethod = 'pay_now' | 'pay_after_service';

interface PaymentMethodSelectorProps {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
}

export function PaymentMethodSelector({ selected, onChange, disabled }: PaymentMethodSelectorProps) {
  return (
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
        <CreditCard className={cn(
          "w-5 h-5",
          selected === 'pay_now' ? "text-primary" : "text-muted-foreground"
        )} />
        <span className={cn(
          "text-xs font-semibold leading-tight text-center",
          selected === 'pay_now' ? "text-primary" : "text-foreground"
        )}>
          Pay Now
        </span>
        <span className="text-[10px] text-muted-foreground leading-tight text-center">
          Online payment
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
  );
}
