import React from 'react';
import { UPI_APPS, tryOpen, UpiApp, UpiParams, generateTransactionRef } from '@/utils/upi';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  upiId: string;
  workerName?: string;
  bookingId?: string;
  amount?: number;
  onPaymentLaunched?: () => void; // Called when UPI app opens successfully
};

export default function UpiChooser({ 
  open, 
  onOpenChange, 
  upiId, 
  workerName, 
  bookingId,
  amount,
  onPaymentLaunched 
}: Props) {
  const [copiedUpi, setCopiedUpi] = React.useState(false);
  const [copiedAmount, setCopiedAmount] = React.useState(false);

  const handlePick = async (app: UpiApp) => {
    // Generate new transaction reference for each payment attempt
    const tr = generateTransactionRef();
    
    const params: UpiParams = {
      pa: upiId.trim(),
      pn: workerName || 'Didi Now Worker',
      tn: bookingId 
        ? `Didi Now booking #${bookingId.substring(0, 8)}`
        : 'Didi Now service payment',
      am: amount,
      tr,
    };
    
    const url = app.buildUrl(params);
    console.log('[UPI] Opening via', app.label, ':', url);
    
    const ok = await tryOpen(url);
    if (!ok) {
      toast.error(`Could not open ${app.label}`);
      return;
    }
    
    onOpenChange(false);
    // Signal that UPI app was opened - caller should set pending flag
    onPaymentLaunched?.();
  };

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upiId.trim());
      setCopiedUpi(true);
      toast.success('UPI ID copied!');
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleCopyAmount = async () => {
    if (!amount) return;
    try {
      await navigator.clipboard.writeText(amount.toFixed(2));
      setCopiedAmount(true);
      toast.success('Amount copied!');
      setTimeout(() => setCopiedAmount(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="space-y-4">
        <SheetHeader>
          <SheetTitle>Select UPI App</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Pay to: <span className="font-mono font-medium">{upiId}</span>
            </p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleCopyUpi}
              className="h-8 px-2"
            >
              {copiedUpi ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          {amount && amount > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-green-600">
                Amount: ₹{amount.toFixed(2)}
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleCopyAmount}
                className="h-8 px-2"
              >
                {copiedAmount ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">
            💡 Payment goes directly to worker's UPI. We don't process payments.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {UPI_APPS.map(app => (
            <Button 
              key={app.key} 
              variant="secondary" 
              className="h-12" 
              onClick={() => handlePick(app)}
            >
              {app.label}
            </Button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          If app doesn't open, use Copy buttons above to pay manually
        </p>
      </SheetContent>
    </Sheet>
  );
}
