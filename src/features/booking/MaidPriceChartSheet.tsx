import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FLAT_SIZES } from './pricing';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userFlatSize: string | null;
  community?: string;
}

export function MaidPriceChartSheet({ open, onOpenChange, userFlatSize, community }: Props) {
  const { data: prices, isLoading } = useQuery({
    queryKey: ['maid_price_chart', community],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maid_pricing_tasks')
        .select('task, flat_size, price_inr, community')
        .eq('active', true)
        .in('task', ['floor_cleaning', 'dish_washing']);

      if (error) throw error;

      // Build map: flat_size -> { floor_cleaning, dish_washing }
      const map = new Map<string, { floor: number | null; dish: number | null }>();

      // Global first
      (data || [])
        .filter(r => !r.community || r.community === '')
        .forEach(r => {
          if (!map.has(r.flat_size)) map.set(r.flat_size, { floor: null, dish: null });
          const entry = map.get(r.flat_size)!;
          if (r.task === 'floor_cleaning') entry.floor = r.price_inr;
          if (r.task === 'dish_washing') entry.dish = r.price_inr;
        });

      // Community override
      if (community) {
        (data || [])
          .filter(r => r.community === community)
          .forEach(r => {
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
          <SheetTitle className="text-lg font-bold text-foreground">
            Maid Pricing by Flat Size
          </SheetTitle>
        </SheetHeader>

        {/* Table */}
        <div className="rounded-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-4 bg-muted/60 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="p-3">Flat</div>
            <div className="p-3 text-right">Floor</div>
            <div className="p-3 text-right">Dishes</div>
            <div className="p-3 text-right">Both</div>
          </div>

          {/* Rows */}
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-4 border-t border-border">
                <div className="p-3"><Skeleton className="h-5 w-14" /></div>
                <div className="p-3 flex justify-end"><Skeleton className="h-5 w-10" /></div>
                <div className="p-3 flex justify-end"><Skeleton className="h-5 w-10" /></div>
                <div className="p-3 flex justify-end"><Skeleton className="h-5 w-10" /></div>
              </div>
            ))
          ) : (
            FLAT_SIZES.map(size => {
              const row = prices?.get(size);
              const isUser = size === userFlatSize;
              const floor = row?.floor;
              const dish = row?.dish;
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
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary text-primary font-bold">
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

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Your booking price is based on your registered flat size.
        </p>
      </SheetContent>
    </Sheet>
  );
}
