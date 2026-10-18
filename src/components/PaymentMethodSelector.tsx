import React from 'react';
import { HandCoins, Wallet, Smartphone, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNativeApp } from '@/utils/platform';
import { usePayAfterServiceEnabled } from '@/hooks/useAppConfigFlags';

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

/**
 * Presentation-only mirror of the existing wallet rules:
 * - wallet covers all → wallet-only payment
 * - partial balance + Pay Now → balance applied automatically, rest online
 * - pay after service → nothing paid now
 */
export function getPaymentBreakdown(method: PaymentMethod, walletBalance = 0, bookingAmount = 0) {
  const walletCoversAll = walletBalance > 0 && bookingAmount > 0 && walletBalance >= bookingAmount;
  const walletPartial = walletBalance > 0 && bookingAmount > 0 && !walletCoversAll;
  let walletApplied = 0;
  let payOnline = 0;
  if (method === 'wallet' && walletCoversAll) {
    walletApplied = bookingAmount;
  } else if (method === 'pay_now') {
    walletApplied = walletPartial ? walletBalance : 0;
    payOnline = Math.max(0, bookingAmount - walletApplied);
  }
  return { walletCoversAll, walletPartial, walletApplied, payOnline };
}

/** Primary action label for the payment popup. */
export function getPaymentActionLabel(method: PaymentMethod, walletBalance = 0, bookingAmount = 0) {
  if (method === 'pay_after_service') return 'Confirm Booking';
  const b = getPaymentBreakdown(method, walletBalance, bookingAmount);
  if (method === 'wallet') return `Pay ₹${b.walletApplied} from Wallet`;
  return `Pay ₹${b.payOnline} securely`;
}

function Radio({ on }: { on: boolean }) {
  return (
    <span className={cn(
      'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center',
      on ? 'border-primary' : 'border-muted-foreground/30'
    )}>
      {on && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
    </span>
  );
}

function Option({
  active, disabled, onClick, icon, title, subtitle,
}: {
  active: boolean; disabled?: boolean; onClick: () => void;
  icon: React.ReactNode; title: string; subtitle: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'border-border bg-card',
        disabled ? 'opacity-55 cursor-not-allowed' : !active && 'active:bg-muted'
      )}
    >
      <span className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
        active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      )}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-foreground leading-tight">{title}</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</span>
      </span>
      <Radio on={active} />
    </button>
  );
}

export function PaymentMethodSelector({ selected, onChange, disabled, walletBalance = 0, bookingAmount = 0 }: PaymentMethodSelectorProps) {
  const isNative = isNativeApp();
  const payNowDisabled = !isNative; // Pay Now only works in native app
  const payAfterEnabled = usePayAfterServiceEnabled();
  const { walletCoversAll, walletPartial, walletApplied, payOnline } =
    getPaymentBreakdown(selected, walletBalance, bookingAmount);

  // Auto-select wallet if it covers full amount
  React.useEffect(() => {
    if (walletCoversAll && selected !== 'wallet') onChange('wallet');
  }, [walletCoversAll, selected, onChange]);

  // Web: Pay Now unavailable → fall back to a valid option.
  React.useEffect(() => {
    if (payNowDisabled && selected === 'pay_now') {
      if (walletCoversAll) onChange('wallet');
      else if (payAfterEnabled) onChange('pay_after_service');
    }
  }, [payNowDisabled, selected, walletCoversAll, payAfterEnabled, onChange]);

  // Pay after service no longer available → switch.
  React.useEffect(() => {
    if (!payAfterEnabled && selected === 'pay_after_service') {
      onChange(walletCoversAll ? 'wallet' : 'pay_now');
    }
  }, [payAfterEnabled, selected, walletCoversAll, onChange]);

  return (
    <div className="space-y-4">
      {/* A — Summary */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">Total booking amount</p>
        <p className="text-3xl font-bold text-foreground tracking-tight mt-0.5">₹{bookingAmount}</p>
      </div>

      {/* B — Methods */}
      <div className="space-y-2" role="radiogroup" aria-label="Payment method">
        <Option
          active={selected === 'wallet'}
          disabled={disabled || !walletCoversAll}
          onClick={() => onChange('wallet')}
          icon={<Wallet className="w-5 h-5" />}
          title="Didi Now Wallet"
          subtitle={
            walletCoversAll
              ? <>Balance ₹{walletBalance} · Pay fully from wallet</>
              : walletPartial
                ? <>Balance ₹{walletBalance} · Not enough to pay in full</>
                : <>Balance ₹0</>
          }
        />
        {!walletCoversAll && (
          <Option
            active={selected === 'pay_now'}
            disabled={disabled || payNowDisabled}
            onClick={() => !payNowDisabled && onChange('pay_now')}
            icon={<Smartphone className="w-5 h-5" />}
            title="UPI / Card"
            subtitle={
              payNowDisabled
                ? 'Available in the Didi Now mobile app'
                : walletPartial
                  ? <>Wallet ₹{walletBalance} applied · rest via UPI or card</>
                  : 'PhonePe, Google Pay, Paytm, cards'
            }
          />
        )}
        {payAfterEnabled && (
          <Option
            active={selected === 'pay_after_service'}
            disabled={disabled}
            onClick={() => onChange('pay_after_service')}
            icon={<HandCoins className="w-5 h-5" />}
            title="Pay After Service"
            subtitle="Pay once the service is completed"
          />
        )}
      </div>

      {/* C — Breakdown */}
      {selected !== 'pay_after_service' && (
        <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-xs space-y-1.5">
          <div className="flex justify-between text-muted-foreground">
            <span>Booking total</span><span>₹{bookingAmount}</span>
          </div>
          {walletApplied > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Wallet applied</span><span>−₹{walletApplied}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1.5">
            <span>{selected === 'wallet' ? 'Paid from wallet' : 'Amount to pay online'}</span>
            <span className="text-primary">₹{selected === 'wallet' ? walletApplied : payOnline}</span>
          </div>
        </div>
      )}

      <p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <ShieldCheck className="w-3 h-3" /> 100% secure payments
      </p>
    </div>
  );
}
