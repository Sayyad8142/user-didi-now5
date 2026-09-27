import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { invokeWithFirebaseAuth } from '@/lib/paymentService';
import { runCheckout } from '@/lib/checkoutRunner';
import { useWalletRefresh } from '@/hooks/useWallet';

interface TipSummary {
  enabled: boolean;
  tippable: boolean;
  total_tip: number;
  remaining: number;
  options: number[];
}

interface Props {
  bookingId: string;
  status: string;
  hasWorker: boolean;
  servicePrice?: number | null;
}

const ACTIVE = ['assigned', 'accepted', 'confirmed', 'on_the_way', 'reached', 'started', 'in_progress'];

export function BookingTipSection({ bookingId, status, hasWorker, servicePrice }: Props) {
  const [summary, setSummary] = useState<TipSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const keyRef = useRef<string | null>(null);
  const { refreshWallet } = useWalletRefresh();

  const load = useCallback(async () => {
    try {
      const s = await invokeWithFirebaseAuth<TipSummary>('booking-tip', { action: 'status', booking_id: bookingId });
      setSummary(s);
    } catch {
      setSummary(null);
    }
  }, [bookingId]);

  const relevant = hasWorker && (ACTIVE.includes(status) || status === 'completed');
  useEffect(() => { if (relevant) void load(); }, [relevant, load, status]);

  if (!relevant || !summary?.enabled) return null;
  const tipped = summary.total_tip;
  const canTip = summary.tippable && ACTIVE.includes(status) && summary.options.length > 0;
  if (!tipped && !canTip) return null;

  const pay = async () => {
    if (!selected || paying) return;
    setPaying(true);
    if (!keyRef.current) keyRef.current = `${bookingId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = keyRef.current;
    try {
      const res: any = await invokeWithFirebaseAuth('booking-tip', {
        action: 'pay', booking_id: bookingId, amount: selected, idempotency_key: key,
      });
      if (res?.needs_razorpay) {
        const result = await runCheckout({
          order_id: res.order_id, amount: res.amount, currency: res.currency, key_id: res.key_id,
          booking_id: bookingId, prefill: { name: '', contact: '' },
        });
        if (result.status !== 'success' || !result.payload) {
          toast({ title: 'Tip not added', description: 'Payment was not completed. You have not been charged for the tip.' });
          await load();
          return;
        }
        await invokeWithFirebaseAuth('booking-tip', { action: 'verify', booking_id: bookingId, ...result.payload });
      }
      toast({ title: `❤️ ₹${selected} tip added`, description: '100% of your tip goes to your Didi.' });
      keyRef.current = null;
      setOpen(false);
      setSelected(null);
      await Promise.allSettled([load(), refreshWallet()]);
    } catch (e: any) {
      const msg = String(e?.backend?.error || e?.message || '');
      const friendly = msg.includes('tip_limit') ? 'The maximum tip for a booking is ₹50.'
        : msg.includes('not_tippable') ? 'Tips can only be added while your Didi is assigned.'
        : 'Could not add the tip. Any amount paid is safe in your wallet.';
      toast({ title: 'Tip not added', description: friendly, variant: 'destructive' });
      keyRef.current = null;
      await Promise.allSettled([load(), refreshWallet()]);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="mt-3 mx-1 rounded-xl border border-border bg-muted/40 p-3">
      {tipped > 0 && (
        <div className="space-y-1 text-sm">
          {servicePrice != null && (
            <div className="flex justify-between text-muted-foreground"><span>Service Price</span><span>₹{servicePrice}</span></div>
          )}
          <div className="flex justify-between text-muted-foreground"><span>Tip</span><span>₹{tipped}</span></div>
          {servicePrice != null && (
            <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
              <span>Total Paid</span><span>₹{Number(servicePrice) + tipped}</span>
            </div>
          )}
          <p className="pt-1 font-medium text-primary">❤️ ₹{tipped} Tip added for your Didi</p>
        </div>
      )}
      {canTip && (
        <Button variant="outline" className="mt-2 w-full gap-2" onClick={() => { setSelected(null); setOpen(true); }}>
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
            {summary.options.map((a) => (
              <Button
                key={a}
                variant={selected === a ? 'default' : 'outline'}
                className="h-12"
                disabled={paying}
                onClick={() => setSelected(a)}
              >
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
