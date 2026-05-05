import { useState } from "react";
import { XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CancelBookingSheet from "./CancelBookingSheet";

interface CancelBookingPillProps {
  booking: any;
  onCancel?: () => void;
  className?: string;
}

/**
 * Compact pill-style Cancel Booking button — matches the visual language of
 * ReportIssueButton so they can sit side-by-side in the booking card footer.
 */
export default function CancelBookingPill({ booking, onCancel, className }: CancelBookingPillProps) {
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isOtpVerified = !!booking.otp_verified_at;
  const canShow =
    !booking.cancelled_at &&
    booking.status !== 'completed' &&
    booking.status !== 'cancelled' &&
    !isOtpVerified;

  if (!canShow) return null;

  async function handleConfirm(reason: string) {
    if (cancelling) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("user_cancel_booking", {
        p_booking_id: booking.id,
        p_reason: reason,
      });

      if (error) {
        if (error.message.includes('cancel_window_expired')) {
          toast({ title: "Cancellation window expired", description: "The free cancellation period for this booking has ended.", variant: "destructive" });
        } else if (error.message.includes('already_finished') || error.message.includes('already completed')) {
          toast({ title: "Cannot cancel", description: "This booking has already been completed or cancelled.", variant: "destructive" });
        } else if (error.message.includes('otp_verified') || error.message.includes('already_completed')) {
          toast({ title: "Cannot cancel", description: "Booking already completed, cannot cancel.", variant: "destructive" });
        } else {
          throw error;
        }
      } else {
        const isPaid = booking.payment_status === 'paid';
        const amount = booking.price_inr || booking.payment_amount_inr;
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
      toast({ title: "Error", description: error.message || "Failed to cancel booking", variant: "destructive" });
    } finally {
      setCancelling(false);
      setSheetOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        disabled={cancelling}
        className={
          className ??
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ring-1 bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100 disabled:opacity-60"
        }
        aria-label="Cancel booking"
      >
        <XCircle className="w-3.5 h-3.5" />
        Cancel Booking
      </button>

      <CancelBookingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onConfirm={handleConfirm}
        loading={cancelling}
      />
    </>
  );
}
