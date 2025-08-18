import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useBookingRealtime(bookingId: string, onUpdate: (row: any) => void) {
  useEffect(() => {
    if (!bookingId) return;
    const ch = supabase
      .channel(`booking-${bookingId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'bookings', 
        filter: `id=eq.${bookingId}` 
      }, (payload) => onUpdate(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [bookingId, onUpdate]);
}