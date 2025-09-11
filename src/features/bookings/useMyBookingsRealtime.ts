import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function useMyBookingsRealtime(enabled: boolean = true) {
  const qc = useQueryClient();
  
  useEffect(() => {
    if (!enabled) return;
    
    const channel = supabase
      .channel("my-bookings-live")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings" },
        () => {
          // Refetch any bookings lists/detail queries
          qc.invalidateQueries({ queryKey: ["bookings"] });
          qc.invalidateQueries({ queryKey: ["bookings","upcoming"] });
          qc.invalidateQueries({ queryKey: ["bookings","history"] });
        }
      )
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [qc, enabled]);
}