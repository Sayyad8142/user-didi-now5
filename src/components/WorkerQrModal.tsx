import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Check, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface WorkerQrModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrImageUrl?: string;
  workerName?: string;
  amount?: number;
}

export function WorkerQrModal({
  open,
  onOpenChange,
  qrImageUrl,
  workerName,
  amount,
}: WorkerQrModalProps) {
  const [copiedAmount, setCopiedAmount] = React.useState(false);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Scan to Pay {workerName || 'Worker'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Code Image */}
          {qrImageUrl ? (
            <div className="flex justify-center p-4 bg-white rounded-lg border">
              <img
                src={qrImageUrl}
                alt="Worker UPI QR Code"
                className="w-64 h-64 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <QrCode className="h-16 w-16 text-gray-400 mb-2" />
              <p className="text-sm text-muted-foreground text-center">
                QR code not available.
              </p>
            </div>
          )}

          {/* Amount */}
          {amount && amount > 0 && (
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div>
                <p className="text-xs text-green-600">Amount to Pay</p>
                <p className="font-semibold text-lg text-green-700">
                  ₹{amount.toFixed(2)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyAmount}
                className="h-8 px-2"
              >
                {copiedAmount ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              📱 Open any UPI app (GPay, PhonePe, Paytm) and scan this QR code
              to pay directly to the worker.
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
