import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useBookingsRealtime(onInsert?: (row:any)=>void, onUpdate?: (row:any)=>void) {
  const insertRef = useRef(onInsert);
  const updateRef = useRef(onUpdate);
  insertRef.current = onInsert;
  updateRef.current = onUpdate;

  useEffect(() => {
    const channel = supabase
      .channel("bookings-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => insertRef.current?.(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings" },
        (payload) => updateRef.current?.(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}