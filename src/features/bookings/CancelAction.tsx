import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CancelBookingSheet from "./CancelBookingSheet";

interface CancelActionProps {
  booking: any;
  onCancel?: () => void;
}

export default function CancelAction({ booking, onCancel }: CancelActionProps) {
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const canShow = !booking.cancelled_at && 
                  booking.status !== 'completed' && 
                  booking.status !== 'cancelled';

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
          toast({
            title: "Cancellation window expired",
            description: "The free cancellation period for this booking has ended.",
            variant: "destructive",
          });
        } else if (error.message.includes('already_finished')) {
          toast({
            title: "Cannot cancel",
            description: "This booking has already been completed or cancelled.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        // Credit wallet if booking was paid
        const isPaid = booking.payment_status === 'paid' || 
                       booking.payment_status === 'wallet_paid' || 
                       booking.payment_status === 'partial_wallet';
        if (isPaid) {
          try {
            await (supabase.rpc as any)('credit_wallet_on_cancel', {
              p_booking_id: booking.id,
              p_reason: `Cancelled: ${reason}`,
            });
            toast({
              title: "Booking cancelled",
              description: `₹${booking.price_inr || 0} has been added to your wallet.`,
            });
          } catch (walletErr) {
            console.error('Wallet credit failed:', walletErr);
            toast({
              title: "Booking cancelled",
              description: "Your booking has been cancelled. Refund will be processed shortly.",
            });
          }
        } else {
          toast({
            title: "Booking cancelled successfully",
            description: "Your booking has been cancelled.",
          });
        }
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
      <div className="mt-3 flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <X className="h-3 w-3" />
          <span>You can cancel this booking anytime</span>
        </div>
        
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setSheetOpen(true)}
          className="h-7 px-3 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
      </div>

      <CancelBookingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onConfirm={handleConfirm}
        loading={cancelling}
      />
    </>
  );
}
