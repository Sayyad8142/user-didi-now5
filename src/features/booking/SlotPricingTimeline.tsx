import { useMemo, useState, useRef, useEffect } from 'react';
import { useSlotSurge } from '@/hooks/useSlotSurge';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

/**
 * Horizontal timeline of hourly slot surge / discount for the current
 * community + service. Shows 07 AM → 07 PM. Reuses the same
 * `slot_surge_pricing` data the pricing card already relies on.
 */
interface Props {
  communityId: string | null | undefined;
  serviceKey: string; // 'maid' | 'bathroom_cleaning'
}

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 12 ? 12 : h > 12 ? h - 12 : h;
  return `${String(display).padStart(2, '0')} ${period}`;
}

function formatTime12(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 12 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

export function SlotPricingTimeline({ communityId, serviceKey }: Props) {
  const { surgeMap, loading } = useSlotSurge(communityId, serviceKey);
  const now = useNow(60_000);
  const [selected, setSelected] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLButtonElement>(null);

  const currentHour = useMemo(() => new Date(now).getHours(), [now]);

  // For each hour, find the largest configured slot ≤ that hour's :00 in the map.
  const rows = useMemo(() => {
    const keys = Object.keys(surgeMap).sort();
    return HOURS.map((h) => {
      const key = `${String(h).padStart(2, '0')}:00:00`;
      // Prefer exact hourly match; else fall back to largest slot ≤ key
      let matched: string | null = surgeMap[key] !== undefined ? key : null;
      if (!matched) {
        for (const k of keys) {
          if (k <= key && (matched === null || k > matched)) matched = k;
        }
      }
      const amount = matched ? (surgeMap[matched] ?? 0) : 0;
      return { hour: h, amount };
    });
  }, [surgeMap]);

  // Auto-scroll the "Now" pill into view once data is loaded.
  useEffect(() => {
    if (loading) return;
    const el = nowRef.current;
    if (el && scrollRef.current) {
      const parent = scrollRef.current;
      const left = el.offsetLeft - parent.clientWidth / 2 + el.clientWidth / 2;
      parent.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
  }, [loading, currentHour]);

  const selectedRow = selected != null ? rows.find((r) => r.hour === selected) : null;

  if (!communityId) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <h4 className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
          Today's Slot Pricing
        </h4>
        <span className="text-[10px] text-muted-foreground">7 AM – 7 PM</span>
      </div>

      {loading ? (
        <div className="flex gap-2 overflow-hidden">
          {HOURS.slice(0, 6).map((h) => (
            <div key={h} className="h-16 w-16 rounded-xl bg-muted animate-pulse shrink-0" />
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {rows.map(({ hour, amount }) => {
            const isNow = hour === currentHour;
            const isDiscount = amount < 0;
            const isSurge = amount > 0;

            return (
              <button
                key={hour}
                ref={isNow ? nowRef : undefined}
                type="button"
                onClick={() => setSelected(hour)}
                className={cn(
                  'relative shrink-0 snap-start rounded-xl border px-3 py-2 flex flex-col items-center justify-center transition-all',
                  isNow ? 'min-w-[72px] scale-105 shadow-md ring-2 ring-primary/60' : 'min-w-[64px]',
                  !isNow && isSurge && 'bg-orange-500 border-orange-600 text-white',
                  !isNow && isDiscount && 'bg-emerald-50 border-emerald-300 text-emerald-700',
                  !isNow && !isSurge && !isDiscount && 'bg-white border-border text-foreground',
                  isNow && isSurge && 'bg-orange-500 border-orange-600 text-white',
                  isNow && isDiscount && 'bg-emerald-500 border-emerald-600 text-white',
                  isNow && !isSurge && !isDiscount && 'bg-primary border-primary text-primary-foreground',
                )}
              >
                {isNow && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">
                    NOW
                  </span>
                )}
                <span className={cn('text-[10px] font-medium opacity-80')}>{formatHour(hour)}</span>
                <span className="text-sm font-bold leading-tight mt-0.5">
                  {amount === 0 ? '₹0' : amount > 0 ? `+₹${amount}` : `-₹${Math.abs(amount)}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          {selectedRow && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  {selectedRow.amount > 0 ? (
                    <TrendingUp className="w-5 h-5 text-orange-500" />
                  ) : selectedRow.amount < 0 ? (
                    <TrendingDown className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <Minus className="w-5 h-5 text-muted-foreground" />
                  )}
                  {formatTime12(selectedRow.hour)}
                </SheetTitle>
                <SheetDescription asChild>
                  <div className="space-y-3 pt-2">
                    <div
                      className={cn(
                        'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold',
                        selectedRow.amount > 0 && 'bg-orange-100 text-orange-700',
                        selectedRow.amount < 0 && 'bg-emerald-100 text-emerald-700',
                        selectedRow.amount === 0 && 'bg-muted text-foreground',
                      )}
                    >
                      {selectedRow.amount > 0
                        ? 'Peak Hour'
                        : selectedRow.amount < 0
                        ? 'Off-Peak Discount'
                        : 'Normal Pricing'}
                    </div>

                    {selectedRow.amount !== 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {selectedRow.amount > 0 ? 'Extra Charge' : 'Save'}
                        </p>
                        <p
                          className={cn(
                            'text-2xl font-bold',
                            selectedRow.amount > 0 ? 'text-orange-600' : 'text-emerald-600',
                          )}
                        >
                          {selectedRow.amount > 0
                            ? `+₹${selectedRow.amount}`
                            : `₹${Math.abs(selectedRow.amount)}`}
                        </p>
                      </div>
                    )}

                    <p className="text-sm text-foreground/80">
                      {selectedRow.amount > 0
                        ? 'This is a high-demand hour. Booking during a normal or off-peak slot can help you save.'
                        : selectedRow.amount < 0
                        ? 'A great time to book — you save on this slot.'
                        : 'Standard base pricing applies for this hour.'}
                    </p>

                    <p className="text-[11px] text-muted-foreground">
                      This is for information only — it does not change your selected booking time.
                    </p>
                  </div>
                </SheetDescription>
              </SheetHeader>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
