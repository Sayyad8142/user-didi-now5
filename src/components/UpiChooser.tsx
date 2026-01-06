import React from 'react';
import { UPI_APPS, tryOpen, UpiApp, UpiParams, generateTransactionRef } from '@/utils/upi';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Copy, Check, QrCode } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workerName?: string;
  bookingId?: string;
  amount?: number;
  qrPayload?: string;     // Required: decoded QR payload
  qrImageUrl?: string;    // Optional: QR image URL for fallback display
  onPaymentLaunched?: () => void;
  onShowQr?: () => void;
};

/**
 * Parse QR payload and extract params
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
  workerName, 
  bookingId,
  amount,
  qrPayload,
  qrImageUrl,
  onPaymentLaunched,
  onShowQr
}: Props) {
  const [copiedAmount, setCopiedAmount] = React.useState(false);

  // Extract UPI ID from QR payload
  const upiIdFromQr = React.useMemo(() => {
    if (!qrPayload) return null;
    const qrParams = parseQrPayload(qrPayload);
    return qrParams.get('pa') || null;
  }, [qrPayload]);

  const handlePick = async (app: UpiApp) => {
    if (!qrPayload) {
      toast.error('QR code not available');
      return;
    }

    // Parse QR payload and extract UPI ID
    const qrParams = parseQrPayload(qrPayload);
    const pa = qrParams.get('pa');
    
    if (!pa) {
      toast.error('Invalid QR code');
      return;
    }

    // Generate new transaction reference
    const tr = generateTransactionRef();
    
    const params: UpiParams = {
      pa: pa.trim(),
      pn: workerName || qrParams.get('pn') || 'Didi Now Worker',
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
    onPaymentLaunched?.();
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="space-y-4">
        <SheetHeader>
          <SheetTitle>Select UPI App</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-2">
          {amount && amount > 0 && (
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-semibold text-green-700">
                Amount to Pay: ₹{amount.toFixed(2)}
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
            💡 Select your UPI app below. Payment will open directly with worker's details.
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

        {/* Show QR option as fallback */}
        {qrImageUrl && onShowQr && (
          <Button
            variant="outline"
            className="w-full h-10"
            onClick={handleShowQr}
          >
            <QrCode className="w-4 h-4 mr-2" />
            Scan QR Code Instead
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          If app doesn't open, use "Scan QR Code" option above
        </p>
      </SheetContent>
    </Sheet>
  );
}
