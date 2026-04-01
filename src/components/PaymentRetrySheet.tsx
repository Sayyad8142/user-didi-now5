import React, { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Loader2, RotateCcw, CreditCard, HandCoins, WifiOff, XCircle,
  Clock, ShieldCheck, AlertTriangle
} from 'lucide-react';
import type { PaymentErrorType } from '@/lib/paymentService';
import { trackPaymentEvent, getRetrySuggestion } from '@/lib/paymentAnalytics';

// ─── Error config ─────────────────────────────────────────────
interface ErrorConfig {
  title: string;
  message: string;
  icon: React.ReactNode;
  primaryLabel: string;
  showFallback: boolean;
  showPayAfter: boolean;
  allowRetry: boolean;
}

function getErrorConfig(errorType: PaymentErrorType): ErrorConfig {
  switch (errorType) {
    case 'user_cancelled':
      return {
        title: 'Payment not completed',
        message: 'Your booking is saved. Complete payment to confirm.',
        icon: <XCircle className="w-6 h-6 text-amber-500" />,
        primaryLabel: 'Retry Payment',
        showFallback: false,
        showPayAfter: true,
        allowRetry: true,
      };
    case 'payment_failed':
      return {
        title: 'Payment failed',
        message: 'Try again or use a different payment method.',
        icon: <AlertTriangle className="w-6 h-6 text-destructive" />,
        primaryLabel: 'Retry Payment',
        showFallback: true,
        showPayAfter: true,
        allowRetry: true,
      };
    case 'network_error':
      return {
        title: 'Network issue',
        message: 'Check your internet connection and try again.',
        icon: <WifiOff className="w-6 h-6 text-destructive" />,
        primaryLabel: 'Try Again',
        showFallback: false,
        showPayAfter: true,
        allowRetry: true,
      };
    case 'verification_failed':
      return {
        title: 'Checking your payment…',
        message: 'Your payment is being verified. This may take a moment.',
        icon: <Loader2 className="w-6 h-6 text-primary animate-spin" />,
        primaryLabel: 'Verifying…',
        showFallback: false,
        showPayAfter: false,
        allowRetry: false,
      };
  }
}

// ─── Timer hook ───────────────────────────────────────────────
function useCountdown(createdAt: string | null, minutes: number) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!createdAt) { setRemaining(null); return; }
    const expiresAt = new Date(createdAt).getTime() + minutes * 60 * 1000;

    const tick = () => {
      const diff = Math.max(0, expiresAt - Date.now());
      setRemaining(Math.floor(diff / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt, minutes]);

  if (remaining === null) return { display: '', isExpired: false };
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return {
    display: `${m}:${s.toString().padStart(2, '0')}`,
    isExpired: remaining <= 0,
  };
}

// ─── Component ────────────────────────────────────────────────
interface PaymentRetrySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorType: PaymentErrorType;
  bookingCreatedAt: string | null;
  onRetry: () => void;
  onPayAfterService?: () => void;
  retrying: boolean;
  /** auto-poll for verification_failed */
  onVerificationResolved?: () => void;
}

export function PaymentRetrySheet({
  open,
  onOpenChange,
  errorType,
  bookingCreatedAt,
  onRetry,
  onPayAfterService,
  retrying,
  onVerificationResolved,
}: PaymentRetrySheetProps) {
  const config = getErrorConfig(errorType);
  const { display: timerDisplay, isExpired } = useCountdown(bookingCreatedAt, 10);

  // Auto-dismiss verification_failed after 15s and let parent refresh
  useEffect(() => {
    if (errorType !== 'verification_failed' || !open) return;
    const t = setTimeout(() => {
      onVerificationResolved?.();
    }, 15_000);
    return () => clearTimeout(t);
  }, [errorType, open, onVerificationResolved]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-5 pb-8 pt-3 max-h-[85vh]">
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />

        <SheetHeader className="mb-1">
          <SheetTitle className="sr-only">Complete your payment</SheetTitle>
        </SheetHeader>

        {/* Icon + title */}
        <div className="flex flex-col items-center text-center gap-2 mb-4">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center",
            errorType === 'verification_failed' ? 'bg-primary/10' :
            errorType === 'user_cancelled' ? 'bg-amber-50' : 'bg-destructive/10'
          )}>
            {config.icon}
          </div>
          <h2 className="text-base font-bold text-foreground">{config.title}</h2>
          <p className="text-sm text-muted-foreground leading-snug max-w-[260px]">
            {config.message}
          </p>
        </div>

        {/* Timer */}
        {config.allowRetry && timerDisplay && !isExpired && (
          <div className="flex items-center justify-center gap-1.5 mb-4 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>Complete payment in <span className="font-semibold text-foreground">{timerDisplay}</span></span>
          </div>
        )}

        {isExpired && config.allowRetry && (
          <div className="text-center mb-4 text-xs text-destructive font-medium">
            Booking time expired. Please create a new booking.
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2.5">
          {/* Primary retry */}
          {config.allowRetry && (
            <Button
              className="w-full h-12 text-sm font-semibold rounded-2xl gap-2"
              disabled={retrying || isExpired}
              onClick={onRetry}
            >
              {retrying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              {retrying ? 'Opening payment…' : config.primaryLabel}
            </Button>
          )}

          {/* Fallback suggestion */}
          {config.showFallback && !isExpired && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 text-xs text-muted-foreground">
              <CreditCard className="w-3.5 h-3.5 shrink-0" />
              <span>Try Card or Netbanking if UPI didn't work</span>
            </div>
          )}

          {/* Pay After Service */}
          {config.showPayAfter && onPayAfterService && !isExpired && (
            <Button
              variant="outline"
              className="w-full h-11 text-sm rounded-2xl gap-2"
              disabled={retrying}
              onClick={onPayAfterService}
            >
              <HandCoins className="w-4 h-4" />
              Pay After Service
            </Button>
          )}

          {/* Trust bar */}
          <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="w-3 h-3" />
            <span>Secure payment · Support available</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
