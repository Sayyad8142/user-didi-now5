import React from 'react';
import { Star, AlertCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface RatingRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Service name (e.g. "Maid Service") for context. Optional. */
  serviceName?: string | null;
  /** Called when user taps "Rate Previous Booking" */
  onRateNow: () => void;
  /** Called when user taps "Maybe Later" / dismisses */
  onDismiss?: () => void;
}

/**
 * Blocking dialog shown BEFORE payment when the user has an unrated
 * completed booking. Same dialog is reused if the backend ever returns
 * RATING_REQUIRED as a fallback.
 */
export function RatingRequiredDialog({
  open,
  onOpenChange,
  serviceName,
  onRateNow,
  onDismiss,
}: RatingRequiredDialogProps) {
  const handleDismiss = () => {
    onOpenChange(false);
    onDismiss?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm rounded-2xl">
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
            <AlertCircle className="h-7 w-7 text-amber-500" />
          </div>
          <AlertDialogTitle className="text-center text-base font-bold">
            Please rate your previous service
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm leading-snug">
            You need to rate your last completed
            {serviceName ? ` ${serviceName}` : ''} booking before booking again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={() => {
              onOpenChange(false);
              onRateNow();
            }}
            className="w-full h-11 rounded-2xl text-sm font-semibold gap-2"
          >
            <Star className="h-4 w-4" fill="currentColor" />
            Rate Previous Booking
          </Button>
          <Button
            variant="outline"
            onClick={handleDismiss}
            className="w-full h-11 rounded-2xl text-sm"
          >
            Maybe Later
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
