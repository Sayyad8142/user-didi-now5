import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check, Download, QrCode, CreditCard, Banknote, X, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface PayWorkerManualSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  workerName?: string;
  amount?: number;
  upiId?: string | null;
  qrImageUrl?: string | null;
  paymentStatus?: string;
  onPaymentComplete?: () => void;
}

export function PayWorkerManualSheet({
  open,
  onOpenChange,
  bookingId,
  workerName,
  amount,
  upiId,
  qrImageUrl,
  paymentStatus,
  onPaymentComplete,
}: PayWorkerManualSheetProps) {
  const queryClient = useQueryClient();
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const alreadyPaid = paymentStatus === 'paid';

  const handleCopyUpi = async () => {
    if (!upiId) return;
    try {
      await navigator.clipboard.writeText(upiId);
      setCopiedUpi(true);
      toast.success('UPI ID copied!');
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      toast.error('Failed to copy UPI ID');
    }
  };

  const handleDownloadQr = async () => {
    if (!qrImageUrl) return;
    
    try {
      toast.loading('Downloading QR...', { id: 'download-qr' });
      
      const response = await fetch(qrImageUrl);
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `didi-now-worker-qr-${bookingId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.dismiss('download-qr');
      toast.success('QR downloaded!');
    } catch (error) {
      console.error('[Download QR] Error:', error);
      toast.dismiss('download-qr');
      toast.error('Failed to download QR');
    }
  };

  const handlePaymentConfirmation = async (method: 'upi_manual' | 'cash' | null) => {
    if (method === null) {
      // Not paid yet - just close dialog
      setShowConfirmDialog(false);
      return;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          payment_method: method,
          paid_confirmed_by_user: true,
          paid_confirmed_at: new Date().toISOString(),
          user_marked_paid_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (error) throw error;

      toast.success('Payment marked as paid!');
      
      // Invalidate booking queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      
      setShowConfirmDialog(false);
      onOpenChange(false);
      onPaymentComplete?.();
    } catch (error) {
      console.error('[Payment] Update error:', error);
      toast.error('Could not update payment status');
    } finally {
      setIsUpdating(false);
    }
  };

  const hasUpiId = !!upiId;
  const hasQrCode = !!qrImageUrl;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-auto max-h-[90vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-5 w-5 text-primary" />
              Pay {workerName || 'Worker'}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 pb-6">
            {/* Already Paid Banner */}
            {alreadyPaid && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Payment already marked as paid</span>
                </div>
              </div>
            )}

            {/* Amount Display */}
            {amount && amount > 0 && (
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Amount to Pay</p>
                <p className="text-2xl font-bold text-green-700">₹{amount.toFixed(2)}</p>
              </div>
            )}

            {/* UPI ID Row */}
            {hasUpiId ? (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Worker UPI ID</p>
                  <p className="font-mono text-sm font-medium truncate">{upiId}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyUpi}
                  className="ml-3 shrink-0"
                >
                  {copiedUpi ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span className="ml-1.5">{copiedUpi ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">Worker UPI ID not available</p>
              </div>
            )}

            {/* QR Code Preview */}
            {hasQrCode ? (
              <div className="space-y-3">
                <div className="flex justify-center p-4 bg-white rounded-lg border">
                  <img
                    src={qrImageUrl!}
                    alt="Worker UPI QR Code"
                    className="w-56 h-56 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                
                {/* Download QR Button */}
                <Button
                  variant="outline"
                  onClick={handleDownloadQr}
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download QR
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <QrCode className="h-12 w-12 text-gray-400 mb-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Worker QR not available
                </p>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                📱 Copy the UPI ID or scan/download QR and pay from any UPI app (GPay, PhonePe, Paytm).
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={alreadyPaid}
                className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-sm text-base"
              >
                <CreditCard className="h-5 w-5 mr-2" />
                I've Paid
              </Button>
              
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="w-full h-10"
              >
                Close / Pay Later
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payment</AlertDialogTitle>
            <AlertDialogDescription>
              How did you pay the worker?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Button
              onClick={() => handlePaymentConfirmation('upi_manual')}
              disabled={isUpdating}
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Paid Online (UPI)
            </Button>
            <Button
              onClick={() => handlePaymentConfirmation('cash')}
              disabled={isUpdating}
              variant="outline"
              className="w-full h-11 font-semibold border-green-600 text-green-700 hover:bg-green-50"
            >
              <Banknote className="h-4 w-4 mr-2" />
              Paid Cash
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => handlePaymentConfirmation(null)}
              disabled={isUpdating}
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Not Paid Yet
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
