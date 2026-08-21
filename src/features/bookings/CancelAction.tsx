import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CancelBookingSheet from "./CancelBookingSheet";
import { cancelMyBooking, type CancelBookingResponse } from "./cancelBookingClient";

interface CancelActionProps {
  booking: any;
  onCancel?: () => void;
}

export default function CancelAction({ booking, onCancel }: CancelActionProps) {
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Block cancellation if OTP has been verified (booking completed via OTP)
  const isOtpVerified = !!booking.otp_verified_at;

  const canShow = !booking.cancelled_at && 
                  booking.status !== 'completed' && 
                  booking.status !== 'cancelled' &&
                  !isOtpVerified;

  if (!canShow) return null;

  async function handleConfirm(reason: string) {
    if (cancelling) return;
    setCancelling(true);
    try {
      let result: CancelBookingResponse | null = null;
      const error: { message: string } | null = await cancelMyBooking(booking.id, reason)
        .then((res) => { result = res; return null; })
        .catch((e: any) => ({ message: e?.message || "Failed to cancel booking" }));
      
      if (error) {
        if (error.message.includes('cancel_window_expired')) {
          toast({
            title: "Cancellation window expired",
            description: "The free cancellation period for this booking has ended.",
            variant: "destructive",
          });
        } else if (error.message.includes('already_finished') || error.message.includes('already completed')) {
          toast({
            title: "Cannot cancel",
            description: "This booking has already been completed or cancelled.",
            variant: "destructive",
          });
        } else if (error.message.includes('otp_verified') || error.message.includes('already_completed')) {
          toast({
            title: "Cannot cancel",
            description: "Booking already completed, cannot cancel.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        const isPaid = booking.payment_status === 'paid' || booking.payment_status === 'moved_to_wallet';
        // Always trust the server-resolved refund (amount actually charged),
        // never a locally recomputed / base price.
        const amount =
          result?.refund?.refund_amount ??
          result?.refund?.paid_amount ??
          booking.payment_amount_inr ??
          booking.price_inr;
        toast({
          title: "Booking cancelled",
          description: isPaid && amount
            ? `₹${amount} has been refunded to your Didi Now wallet.`
            : "Your booking has been cancelled.",
        });
        onCancel?.();
      }
    } catch (error: any) {
      console.error("Error cancelling booking:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel booking",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
      setSheetOpen(false);
    }
  }

  return (
    <>

      <CancelBookingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onConfirm={handleConfirm}
        loading={cancelling}
      />
    </>
  );
}
