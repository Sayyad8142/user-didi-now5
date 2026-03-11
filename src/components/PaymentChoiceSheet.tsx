import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Wallet, CreditCard, IndianRupee } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentChoiceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  price: number;
  onPayAfterService: () => void;
  onPayNow: () => void;
  submitting?: boolean;
}

export function PaymentChoiceSheet({
  open,
  onOpenChange,
  price,
  onPayAfterService,
  onPayNow,
  submitting = false,
}: PaymentChoiceSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-8 pt-4">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-lg font-bold text-foreground text-center">
            How would you like to pay?
          </SheetTitle>
          <p className="text-sm text-muted-foreground text-center">
            Total: <span className="font-bold text-foreground">₹{price}</span>
          </p>
        </SheetHeader>

        <div className="space-y-3">
          {/* Pay After Service */}
          <button
            onClick={onPayAfterService}
            disabled={submitting}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 text-left",
              "border-border bg-card hover:border-primary/40 hover:shadow-md active:scale-[0.98]",
              "disabled:opacity-50 disabled:pointer-events-none"
            )}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <IndianRupee className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground text-base">Pay After Service</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Pay via cash or UPI after work is done
              </div>
            </div>
          </button>

          {/* Pay Now Online */}
          <button
            onClick={onPayNow}
            disabled={submitting}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 text-left",
              "border-border bg-card hover:border-primary/40 hover:shadow-md active:scale-[0.98]",
              "disabled:opacity-50 disabled:pointer-events-none"
            )}
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground text-base">Pay Now Online</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Pay instantly via UPI, card, or wallet
              </div>
            </div>
          </button>
        </div>

        {submitting && (
          <div className="flex items-center justify-center mt-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">Processing...</span>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
