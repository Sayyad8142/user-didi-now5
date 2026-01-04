import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, CreditCard } from 'lucide-react';

interface PaymentConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerName: string;
  amount?: number;
  onConfirmPaid: (utr?: string) => void;
  onCancel: () => void;
}

export function PaymentConfirmationDialog({
  open,
  onOpenChange,
  workerName,
  amount,
  onConfirmPaid,
  onCancel,
}: PaymentConfirmationDialogProps) {
  const [utr, setUtr] = useState('');
  const [showUtrInput, setShowUtrInput] = useState(false);

  const handleConfirm = () => {
    onConfirmPaid(utr.trim() || undefined);
    setUtr('');
    setShowUtrInput(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    setUtr('');
    setShowUtrInput(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-green-600" />
            Payment Confirmation
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            <p className="text-base font-medium text-foreground">
              Did you complete the payment to {workerName}?
            </p>
            
            {amount && amount > 0 && (
              <p className="text-sm text-muted-foreground">
                Amount: ₹{amount.toFixed(2)}
              </p>
            )}
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
              <p className="text-xs text-amber-800">
                💡 Payment is done directly to the worker's UPI account. 
                We do not process payments.
              </p>
            </div>

            {showUtrInput && (
              <div className="space-y-2 mt-4">
                <Label htmlFor="utr" className="text-sm font-medium">
                  UPI Transaction ID (Optional)
                </Label>
                <Input
                  id="utr"
                  placeholder="Enter UTR/Transaction ID"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  You can find this in your UPI app's transaction history
                </p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => {
              if (!showUtrInput) {
                setShowUtrInput(true);
              } else {
                handleConfirm();
              }
            }}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {showUtrInput ? 'Confirm Payment' : 'Yes, I Paid'}
          </Button>
          
          <Button
            variant="outline"
            onClick={handleCancel}
            className="w-full"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel / Not Yet
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
