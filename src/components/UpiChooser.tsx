import React from 'react';
import { UPI_APPS, tryOpen, UpiApp, UpiParams, generateTransactionRef } from '@/utils/upi';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Copy, Check, QrCode } from 'lucide-react';
import { isValidUpiPayload } from '@/utils/launchUpiPayment';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  upiId: string;
  workerName?: string;
  bookingId?: string;
  amount?: number;
  qrPayload?: string;     // Optional: decoded QR payload
  qrImageUrl?: string;    // Optional: QR image URL
  onPaymentLaunched?: () => void; // Called when UPI app opens successfully
  onShowQr?: () => void;  // Called when user wants to show QR
};

/**
 * Parse QR payload and extract/merge params
 */
function parseQrPayload(payload: string): Map<string, string> {
  const params = new Map<string, string>();
  let queryString = payload;
  
  if (payload.toLowerCase().startsWith('upi://pay?')) {
    queryString = payload.substring(10);
  } else if (payload.toLowerCase().startsWith('upi://pay')) {
    queryString = payload.substring(9);
    if (queryString.startsWith('?')) queryString = queryString.substring(1);
  }
  
  const pairs = queryString.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      try {
        params.set(key.toLowerCase().trim(), decodeURIComponent(value.trim()));
      } catch {
        params.set(key.toLowerCase().trim(), value.trim());
      }
    }
  }
  
  return params;
}

export default function UpiChooser({ 
  open, 
  onOpenChange, 
  upiId, 
  workerName, 
  bookingId,
  amount,
  qrPayload,
  qrImageUrl,
  onPaymentLaunched,
  onShowQr
}: Props) {
  const [copiedUpi, setCopiedUpi] = React.useState(false);
  const [copiedAmount, setCopiedAmount] = React.useState(false);

  // Determine effective UPI ID (from qrPayload if available)
  const effectiveUpiId = React.useMemo(() => {
    if (qrPayload && isValidUpiPayload(qrPayload)) {
      const qrParams = parseQrPayload(qrPayload);
      const qrPa = qrParams.get('pa');
      if (qrPa && qrPa.includes('@')) {
        return qrPa;
      }
    }
    return upiId;
  }, [upiId, qrPayload]);

  const handlePick = async (app: UpiApp) => {
    // Generate new transaction reference for each payment attempt
    const tr = generateTransactionRef();
    
    const params: UpiParams = {
      pa: effectiveUpiId.trim(),
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
      await navigator.clipboard.writeText(effectiveUpiId.trim());
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

  const handleShowQr = () => {
    onOpenChange(false);
    onShowQr?.();
  };

  const hasQr = !!(qrImageUrl || (qrPayload && isValidUpiPayload(qrPayload)));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="space-y-4">
        <SheetHeader>
          <SheetTitle>Select UPI App</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Pay to: <span className="font-mono font-medium">{effectiveUpiId}</span>
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

        {/* Show QR option */}
        {hasQr && onShowQr && (
          <Button
            variant="outline"
            className="w-full h-10"
            onClick={handleShowQr}
          >
            <QrCode className="w-4 h-4 mr-2" />
            Show Worker QR Code
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          If app doesn't open, use Copy buttons above to pay manually
        </p>
      </SheetContent>
    </Sheet>
  );
}
