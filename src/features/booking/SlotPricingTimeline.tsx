import { useMemo, useState, useEffect, useRef } from 'react';
import { useSlotSurge } from '@/hooks/useSlotSurge';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { TrendingDown, TrendingUp, Minus, Info } from 'lucide-react';

/**
 * "Today's Slot Pricing" — a compact bar-chart timeline for 7 AM → 7 PM.
 * Each hour is a vertical bar: rising above baseline = surge, dropping below = discount.
 * Uses the same slot_surge_pricing data as the pricing card (no extra API calls).
 */
interface Props {
  communityId: string | null | undefined;
  serviceKey: string;
}

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

function hourLabel(h: number): string {
  const period = h >= 12 ? 'p' : 'a';
  const display = h === 12 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${period}`;
}

function fullTime(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h === 12 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

export function SlotPricingTimeline({ communityId, serviceKey }: Props) {
  const { surgeMap, loading } = useSlotSurge(communityId, serviceKey);
  const now = useNow(60_000);
  const [selected, setSelected] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentHour = useMemo(() => new Date(now).getHours(), [now]);

  const rows = useMemo(() => {
    const keys = Object.keys(surgeMap).sort();
    return HOURS.map((h) => {
      const key = `${String(h).padStart(2, '0')}:00:00`;
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

  const maxAbs = useMemo(() => {
    const m = Math.max(10, ...rows.map((r) => Math.abs(r.amount)));
    return m;
  }, [rows]);

  const currentRow = rows.find((r) => r.hour === currentHour);
  const selectedRow = selected != null ? rows.find((r) => r.hour === selected) : null;

  if (!communityId) return null;

  const BAR_MAX_H = 28; // px above/below the baseline

  return (
    <div className="mt-3 rounded-2xl border border-primary/15 bg-white/70 backdrop-blur-sm p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <h4 className="text-[11px] font-bold text-foreground tracking-wide uppercase">
            Today's Slot Pricing
          </h4>
          <Info className="w-3 h-3 text-muted-foreground" />
        </div>
        {currentRow && (
          <span
            className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full',
              currentRow.amount > 0 && 'bg-orange-100 text-orange-700',
              currentRow.amount < 0 && 'bg-emerald-100 text-emerald-700',
              currentRow.amount === 0 && 'bg-muted text-muted-foreground',
            )}
          >
            Now {currentRow.amount > 0 ? `+₹${currentRow.amount}` : currentRow.amount < 0 ? `-₹${Math.abs(currentRow.amount)}` : '₹0'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-[88px] flex items-end gap-1">
          {HOURS.map((h) => (
            <div key={h} className="flex-1 h-full bg-muted/50 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Chart */}
          <div ref={containerRef} className="relative">
            <div className="flex items-center" style={{ height: BAR_MAX_H * 2 + 8 }}>
              {rows.map(({ hour, amount }) => {
                const isNow = hour === currentHour;
                const pct = Math.abs(amount) / maxAbs;
                const barH = amount === 0 ? 3 : Math.max(4, pct * BAR_MAX_H);
                const isSurge = amount > 0;
                const isDiscount = amount < 0;

                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => setSelected(hour)}
                    className="relative flex-1 h-full flex flex-col items-center justify-center group"
                    aria-label={`${fullTime(hour)} ${amount > 0 ? `+₹${amount}` : amount < 0 ? `-₹${Math.abs(amount)}` : 'base price'}`}
                  >
                    {/* Now spotlight */}
                    {isNow && (
                      <span
                        aria-hidden
                        className="absolute inset-x-1 inset-y-0 rounded-lg bg-primary/10 ring-1 ring-primary/40 animate-pulse"
                      />
                    )}

                    {/* Top half (surge) */}
                    <div className="relative w-full flex justify-center" style={{ height: BAR_MAX_H }}>
                      {isSurge && (
                        <>
                          <span
                            className={cn(
                              'absolute bottom-0 rounded-t-md transition-all',
                              isNow ? 'bg-orange-500 w-3.5' : 'bg-orange-400 w-2.5 group-active:bg-orange-500',
                            )}
                            style={{ height: barH }}
                          />
                          <span
                            className={cn(
                              'absolute -top-1 text-[9px] font-bold',
                              isNow ? 'text-orange-600' : 'text-orange-500',
                            )}
                          >
                            +{amount}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Baseline */}
                    <div className="relative w-full h-[2px] bg-border">
                      {amount === 0 && (
                        <span className={cn(
                          'absolute left-1/2 -translate-x-1/2 -top-[3px] w-2 h-2 rounded-full',
                          isNow ? 'bg-primary ring-2 ring-primary/30' : 'bg-muted-foreground/50',
                        )} />
                      )}
                    </div>

                    {/* Bottom half (discount) */}
                    <div className="relative w-full flex justify-center" style={{ height: BAR_MAX_H }}>
                      {isDiscount && (
                        <>
                          <span
                            className={cn(
                              'absolute top-0 rounded-b-md transition-all',
                              isNow ? 'bg-emerald-500 w-3.5' : 'bg-emerald-400 w-2.5 group-active:bg-emerald-500',
                            )}
                            style={{ height: barH }}
                          />
                          <span
                            className={cn(
                              'absolute -bottom-1 text-[9px] font-bold',
                              isNow ? 'text-emerald-600' : 'text-emerald-500',
                            )}
                          >
                            -{Math.abs(amount)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Hour axis */}
            <div className="flex items-center mt-1">
              {rows.map(({ hour }) => {
                const isNow = hour === currentHour;
                return (
                  <div key={hour} className="flex-1 flex justify-center">
                    <span
                      className={cn(
                        'text-[9px] tabular-nums',
                        isNow ? 'text-primary font-bold' : 'text-muted-foreground',
                      )}
                    >
                      {hourLabel(hour)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 mt-2 pt-2 border-t border-border/50">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-sm bg-emerald-400" /> Cheaper
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/50" /> Base
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-sm bg-orange-400" /> Peak
            </span>
          </div>
        </>
      )}

      <Sheet open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          {selectedRow && (
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                {selectedRow.amount > 0 ? (
                  <TrendingUp className="w-5 h-5 text-orange-500" />
                ) : selectedRow.amount < 0 ? (
                  <TrendingDown className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Minus className="w-5 h-5 text-muted-foreground" />
                )}
                {fullTime(selectedRow.hour)}
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
                        {selectedRow.amount > 0 ? 'Extra Charge' : 'You Save'}
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
                    Informational only — this does not change your selected booking time.
                  </p>
                </div>
              </SheetDescription>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
