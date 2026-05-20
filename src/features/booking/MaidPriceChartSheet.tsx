import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FLAT_SIZES } from './pricing';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userFlatSize: string | null;
  community?: string;
}

interface PriceRow {
  floor: number | null;
  dish: number | null;
}

export function MaidPriceChartSheet({ open, onOpenChange, userFlatSize, community }: Props) {
  const { data: prices, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['maid_price_chart', community ?? 'global'],
    enabled: open,
    // Always fetch fresh prices when the sheet opens so admin updates
    // (admin.didisnow.com/pricing) reflect immediately without an app release.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maid_pricing_tasks')
        .select('task, flat_size, price_inr, community')
        .eq('active', true)
        .in('task', ['floor_cleaning', 'dish_washing']);

      if (error) throw error;

      const map = new Map<string, PriceRow>();

      // Global rows first (community IS NULL or empty string)
      (data || [])
        .filter((r) => r.community === null || r.community === '')
        .forEach((r) => {
          if (!map.has(r.flat_size)) map.set(r.flat_size, { floor: null, dish: null });
          const entry = map.get(r.flat_size)!;
          if (r.task === 'floor_cleaning') entry.floor = r.price_inr;
          if (r.task === 'dish_washing') entry.dish = r.price_inr;
        });

      // Community-specific overrides
      if (community) {
        (data || [])
          .filter((r) => r.community === community)
          .forEach((r) => {
            if (!map.has(r.flat_size)) map.set(r.flat_size, { floor: null, dish: null });
            const entry = map.get(r.flat_size)!;
            if (r.task === 'floor_cleaning') entry.floor = r.price_inr;
            if (r.task === 'dish_washing') entry.dish = r.price_inr;
          });
      }

      return map;
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg font-bold text-foreground flex items-center justify-between">
            <span>Maid Pricing by Flat Size</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh prices"
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </SheetTitle>
        </SheetHeader>

        {isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-foreground">
              Couldn't load latest prices. Please check your connection.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="grid grid-cols-4 bg-muted/60 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <div className="p-3">Flat</div>
              <div className="p-3 text-right">Floor</div>
              <div className="p-3 text-right">Dishes</div>
              <div className="p-3 text-right">Both</div>
            </div>

            {isLoading ? (
              Array.from({ length: FLAT_SIZES.length }).map((_, i) => (
                <div key={i} className="grid grid-cols-4 border-t border-border">
                  <div className="p-3"><Skeleton className="h-5 w-14" /></div>
                  <div className="p-3 flex justify-end"><Skeleton className="h-5 w-10" /></div>
                  <div className="p-3 flex justify-end"><Skeleton className="h-5 w-10" /></div>
                  <div className="p-3 flex justify-end"><Skeleton className="h-5 w-10" /></div>
                </div>
              ))
            ) : (
              FLAT_SIZES.map((size) => {
                const row = prices?.get(size);
                const isUser = size === userFlatSize;
                const floor = row?.floor ?? null;
                const dish = row?.dish ?? null;
                const both = floor != null && dish != null ? floor + dish : null;

                return (
                  <div
                    key={size}
                    className={`grid grid-cols-4 border-t border-border text-sm ${
                      isUser ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="p-3 flex items-center gap-1.5">
                      <span className="font-semibold text-foreground">{size}</span>
                      {isUser && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-primary text-primary font-bold"
                        >
                          Your Flat
                        </Badge>
                      )}
                    </div>
                    <div className="p-3 text-right font-medium text-foreground">
                      {floor != null ? `₹${floor}` : '—'}
                    </div>
                    <div className="p-3 text-right font-medium text-foreground">
                      {dish != null ? `₹${dish}` : '—'}
                    </div>
                    <div className="p-3 text-right font-bold text-primary">
                      {both != null ? `₹${both}` : '—'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Prices are live from admin and may vary by community. Your booking price is based on your registered flat size.
        </p>
      </SheetContent>
    </Sheet>
  );
}
