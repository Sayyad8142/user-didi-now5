import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { useToast } from "@/hooks/use-toast";

export function useBookingStatusToasts(enabled: boolean = true) {
  const { toast } = useToast();
  const { profile } = useProfile();
  const lastStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!enabled || !profile?.id) return;
    
    let mounted = true;
    
    // Use profile.id (Supabase UUID), not Firebase UID
    const profileId = profile.id;

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
          
          // Only show toasts for current user's bookings - compare UUID to UUID
          if (profileId && booking.user_id !== profileId) return;

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
  }, [toast, enabled, profile?.id]);
}
