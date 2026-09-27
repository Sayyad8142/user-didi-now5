import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { invokeWithFirebaseAuth } from '@/lib/paymentService';
import { runCheckout } from '@/lib/checkoutRunner';
import { useWalletRefresh } from '@/hooks/useWallet';

/** Authoritative tip state — always read from the server, never derived locally. */
interface TipSummary {
  enabled: boolean;
  tippable?: boolean;
  service_price?: number | null;
  total_tip?: number;
  pending_tip?: number;
  remaining?: number;
  options?: number[];
  payout_status?: 'unpaid' | 'included_in_payout';
  refund_status?: 'none' | 'refunded_to_wallet';
  refunded_amount?: number;
  late_refunded_amount?: number;
  last_attempt?: { id: string; status: string; amount: number } | null;
}

interface Props {
  bookingId: string;
  status: string;
  hasWorker: boolean;
  servicePrice?: number | null;
}

const OPEN = ['assigned', 'accepted', 'on_the_way', 'started'];
const SHOW = [...OPEN, 'completed', 'cancelled'];

/** One idempotency key per tip attempt, persisted so retries/resumes reuse it. */
const attemptKey = (bookingId: string) => `tip_attempt_${bookingId}`;
function getAttempt(bookingId: string, amount: number): string {
  try {
    const raw = localStorage.getItem(attemptKey(bookingId));
    if (raw) {
      const a = JSON.parse(raw);
      if (a?.amount === amount && typeof a.key === 'string') return a.key;
    }
  } catch { /* ignore */ }
  const key = `tip-${bookingId.slice(0, 8)}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(attemptKey(bookingId), JSON.stringify({ key, amount })); } catch { /* ignore */ }
  return key;
}
const clearAttempt = (bookingId: string) => { try { localStorage.removeItem(attemptKey(bookingId)); } catch { /* ignore */ } };

export function BookingTipSection({ bookingId, status, hasWorker, servicePrice }: Props) {
  const [summary, setSummary] = useState<TipSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const inFlight = useRef(false);
  const { refreshWallet } = useWalletRefresh();

  const load = useCallback(async () => {
    try {
      setSummary(await invokeWithFirebaseAuth<TipSummary>('booking-tip', { action: 'status', booking_id: bookingId }));
    } catch {
      setSummary(null);
    }
  }, [bookingId]);

  const relevant = hasWorker && SHOW.includes(status);
  useEffect(() => { if (relevant) void load(); }, [relevant, load, status]);
  useEffect(() => {
    if (!relevant) return;
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [relevant, load]);

  if (!relevant || !summary?.enabled) return null;

  const tipped = Number(summary.total_tip || 0);
  const pending = Number(summary.pending_tip || 0);
  const lateRefund = Number(summary.late_refunded_amount || 0);
  const cancelRefund = summary.refund_status === 'refunded_to_wallet' ? Number(summary.refunded_amount || 0) : 0;
  const canTip = !!summary.tippable && OPEN.includes(status) && (summary.options?.length ?? 0) > 0;
  const price = summary.service_price ?? servicePrice;
  if (!tipped && !pending && !lateRefund && !canTip) return null;

  const finish = async () => { await Promise.allSettled([load(), refreshWallet()]); };

  const pay = async () => {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setPaying(true);
    const key = getAttempt(bookingId, selected);
    let tipPaymentId: string | null = null;
    try {
      const res: any = await invokeWithFirebaseAuth('booking-tip', {
        action: 'start', booking_id: bookingId, amount: selected, idempotency_key: key,
      });
      tipPaymentId = res?.tip_payment_id ?? null;

      if (res?.status === 'razorpay_required') {
        // Checkout shows only the server-computed shortfall.
        const result = await runCheckout({
          order_id: res.order_id, amount: res.amount, currency: res.currency, key_id: res.key_id,
          booking_id: bookingId, prefill: { name: '', contact: '' },
        } as any);
        if (result.status !== 'success' || !result.payload) {
          // Server re-checks Razorpay before releasing the held wallet part.
          const ab: any = await invokeWithFirebaseAuth('booking-tip', {
            action: 'abandon', booking_id: bookingId, tip_payment_id: tipPaymentId,
          }).catch(() => null);
          if (ab?.status === 'confirmed') {
            toast({ title: 'Tip added ❤️', description: `₹${selected} will go to your Didi.` });
          } else {
            toast({ title: 'Tip not added', description: 'Payment was not completed. Any wallet amount used has been returned.' });
          }
          clearAttempt(bookingId);
          return;
        }
        const v: any = await invokeWithFirebaseAuth('booking-tip', {
          action: 'verify', booking_id: bookingId, tip_payment_id: tipPaymentId, ...result.payload,
        });
        res.status = v?.status;
      }

      if (res?.status === 'confirmed') {
        toast({ title: 'Tip added ❤️', description: `₹${selected} will go to your Didi.` });
      } else if (res?.status === 'refunded_to_wallet') {
        toast({ title: 'Tip returned to wallet', description: `Service was completed before the tip payment finished. ₹${selected} has been returned to your Didi Now wallet.` });
      } else {
        toast({ title: 'Processing tip', description: 'We are confirming your payment. This will update shortly.' });
      }
      clearAttempt(bookingId);
      setOpen(false);
      setSelected(null);
    } catch (e: any) {
      const msg = String(e?.backend?.error || e?.message || '');
      const friendly = msg.includes('tip_cap') || msg.includes('tip_limit') ? 'The maximum tip for a booking is ₹50.'
        : msg.includes('not_tippable') ? 'Tips can only be added while your Didi is on this booking.'
        : msg.includes('tips_unavailable') ? 'Tips are not available right now.'
        : 'Could not confirm the tip yet. If you paid, it will be added or returned to your wallet automatically.';
      toast({ title: 'Tip not added', description: friendly, variant: 'destructive' });
      // Keep the attempt key: a retry of the same amount resumes the same attempt.
    } finally {
      inFlight.current = false;
      setPaying(false);
      await finish();
    }
  };

  return (
    <div className="mt-3 mx-1 rounded-xl border border-border bg-muted/40 p-3">
      {tipped > 0 && cancelRefund === 0 && (
        <div className="space-y-1 text-sm">
          {price != null && (
            <div className="flex justify-between text-muted-foreground"><span>Service Price</span><span>₹{price}</span></div>
          )}
          <div className="flex justify-between text-muted-foreground"><span>Tip</span><span>+₹{tipped} ❤️</span></div>
          {price != null && (
            <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
              <span>Total Paid</span><span>₹{Number(price) + tipped}</span>
            </div>
          )}
          <p className="pt-1 font-medium text-primary">
            {summary.payout_status === 'included_in_payout'
              ? `❤️ ₹${tipped} tip included in your Didi's payout`
              : `❤️ ₹${tipped} tip confirmed for your Didi`}
          </p>
        </div>
      )}
      {pending > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Processing ₹{pending} tip payment…
        </p>
      )}
      {cancelRefund > 0 && (
        <p className="text-sm text-muted-foreground">Your ₹{cancelRefund} tip was returned to your Didi Now wallet.</p>
      )}
      {lateRefund > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          Service was completed before the tip payment finished. ₹{lateRefund} has been returned to your Didi Now wallet.
        </p>
      )}
      {canTip && (
        <Button variant="outline" className="mt-2 w-full gap-2" disabled={paying || pending > 0}
          onClick={() => { setSelected(null); setOpen(true); }}>
          <Heart className="h-4 w-4 text-primary" />
          {tipped > 0 ? 'Add More Tip' : 'Add Tip'}
        </Button>
      )}

      <Sheet open={open} onOpenChange={(o) => !paying && setOpen(o)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle>Tip your Didi ❤️</SheetTitle>
            <SheetDescription>100% of your tip goes to your Didi.</SheetDescription>
          </SheetHeader>
          <div className="mt-5 grid grid-cols-5 gap-2">
            {(summary.options || []).map((a) => (
              <Button key={a} variant={selected === a ? 'default' : 'outline'} className="h-12"
                disabled={paying} onClick={() => setSelected(a)}>
                ₹{a}
              </Button>
            ))}
          </div>
          {tipped > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">You've tipped ₹{tipped}. Maximum tip per booking is ₹50.</p>
          )}
          <Button className="mt-5 h-12 w-full" disabled={!selected || paying} onClick={pay}>
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : selected ? `Pay ₹${selected} tip` : 'Choose an amount'}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Paid from your wallet first, the rest online.</p>
        </SheetContent>
      </Sheet>
    </div>
  );
}
