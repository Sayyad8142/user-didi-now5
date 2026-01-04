import React from 'react';
import { UPI_APPS, detectInstalledUpiApps, tryOpen, UpiApp, UpiParams } from '@/utils/upi';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  upiId: string;
  workerName?: string;
  bookingId?: string;
  amount?: number;
  onPaymentReturn?: () => void;
};

/**
 * Generates a unique transaction reference
 */
function generateTransactionRef(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `DIDI${timestamp}${random}`;
}

export default function UpiChooser({ 
  open, 
  onOpenChange, 
  upiId, 
  workerName, 
  bookingId,
  amount,
  onPaymentReturn 
}: Props) {
  const [loading, setLoading] = React.useState(true);
  const [apps, setApps] = React.useState<UpiApp[]>([]);
  const [forceMode, setForceMode] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (open) {
      setLoading(true);
      setForceMode(false);
      detectInstalledUpiApps().then(list => {
        if (!active) return;
        setApps(list);
        setLoading(false);
        if (list.length === 0) {
          setForceMode(true);
        }
      });
    }
    return () => { active = false; };
  }, [open]);

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
      toast.error(`${app.label} not available on this device`);
      if (app.appStore) {
        toast.message(`Install ${app.label}?`, {
          action: {
            label: 'Open App Store',
            onClick: () => tryOpen(app.appStore!)
          }
        });
      }
      return;
    }
    
    onOpenChange(false);
    // Trigger payment return callback for confirmation dialog
    onPaymentReturn?.();
  };

  const list = apps.length > 0 ? apps : (forceMode ? UPI_APPS : []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="space-y-4">
        <SheetHeader>
          <SheetTitle>Select UPI App</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Pay to: <span className="font-mono font-medium">{upiId}</span>
          </p>
          {amount && amount > 0 && (
            <p className="text-sm font-semibold text-green-600">
              Amount: ₹{amount.toFixed(2)}
            </p>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">
            💡 Payment goes directly to worker's UPI. We don't process payments.
          </p>
        </div>

        {loading && <div className="text-sm opacity-70">Scanning UPI apps…</div>}

        {!loading && list.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {list.map(app => (
              <Button key={app.key} variant="secondary" className="h-12" onClick={() => handlePick(app)}>
                {app.label}
              </Button>
            ))}
          </div>
        )}

        {!loading && list.length === 0 && (
          <div className="text-sm opacity-70">No UPI apps detected.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
