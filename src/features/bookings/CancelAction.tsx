import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CancelActionProps {
  booking: any;
  onCancel?: () => void;
}

function useCountdown(until?: string) {
  const [left, setLeft] = useState<number>(until ? (new Date(until).getTime() - Date.now()) : 0);
  
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => {
      const remaining = new Date(until).getTime() - Date.now();
      setLeft(remaining);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);
  
  const mins = Math.max(0, Math.floor(left / 60000));
  const secs = Math.max(0, Math.floor((left % 60000) / 1000));
  const expired = left <= 0;
  
  return { mins, secs, expired, totalMs: left };
}

export default function CancelAction({ booking, onCancel }: CancelActionProps) {
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  
  const canShow = !booking.cancelled_at && 
                  booking.status !== 'completed' && 
                  booking.status !== 'cancelled';

  if (!canShow) return null;

  async function handleCancel() {
    if (cancelling) return;
    
    if (!confirm("Are you sure you want to cancel this booking? This action cannot be undone.")) {
      return;
    }
    
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("user_cancel_booking", { 
        p_booking_id: booking.id, 
        p_reason: "user_cancel" 
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
        toast({
          title: "Booking cancelled",
          description: "Your booking has been successfully cancelled.",
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
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <X className="h-3 w-3" />
        <span>You can cancel this booking anytime</span>
      </div>
      
      <Button
        size="sm"
        variant="destructive"
        disabled={cancelling}
        onClick={handleCancel}
        className="h-7 px-3 text-xs"
      >
        {cancelling ? (
          <>
            <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin mr-1"></div>
            Cancelling...
          </>
        ) : (
          <>
            <X className="h-3 w-3 mr-1" />
            Cancel
          </>
        )}
      </Button>
    </div>
  );
}