import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { auth as firebaseAuth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

export function useBookingStatusToasts(enabled: boolean = true) {
  const { toast } = useToast();
  const lastStatusRef = useRef<Map<string, string>>(new Map());
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    
    let mounted = true;
    
    // Get current user ID from Firebase
    const user = firebaseAuth.currentUser;
    userIdRef.current = user?.uid ?? null;

    const channel = supabase
      .channel("booking-status-toasts")
      .on(
        "postgres_changes",
        { 
          event: "UPDATE", 
          schema: "public", 
          table: "bookings" 
        },
        (payload: any) => {
          if (!mounted) return;
          
          const booking = payload.new;
          if (!booking?.id) return;
          
          // Only show toasts for current user's bookings
          if (userIdRef.current && booking.user_id !== userIdRef.current) return;

          const previousStatus = lastStatusRef.current.get(booking.id) ?? payload.old?.status;
          const currentStatus = booking.status as string;
          
          // Only show toast if status actually changed
          if (previousStatus && previousStatus !== currentStatus) {
            if (currentStatus === "assigned") {
              toast({ 
                title: "🎉 Booking Confirmed!", 
                description: "Your worker will arrive in ~10 minutes" 
              });
            } else if (currentStatus === "cancelled") {
              toast({ 
                title: "Booking Cancelled", 
                description: "We're sorry, no worker is available right now.",
                variant: "destructive" 
              });
            } else if (currentStatus === "completed") {
              toast({ 
                title: "✅ Service Completed!", 
                description: "Thanks for using our service!" 
              });
            }
          }
          
          // Update the last known status
          lastStatusRef.current.set(booking.id, currentStatus);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [toast, enabled]);
}