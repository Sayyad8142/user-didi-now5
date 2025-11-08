import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface IncomingCallData {
  rtc_call_id: string;
  booking_id: string;
  caller_name?: string;
}

export const useIncomingRtcPush = () => {
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);

  useEffect(() => {
    console.log('📞 Setting up incoming call listener...');
    
    // Listen for real-time updates on rtc_calls table
    const channel = supabase
      .channel('incoming-rtc-calls')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rtc_calls',
        },
        async (payload) => {
          console.log('📞 RTC call received:', payload);
          const newCall = payload.new as any;
          
          // Check if current user is the callee
          const { data: { user } } = await supabase.auth.getUser();
          console.log('📞 Current user:', user?.id, 'Callee:', newCall.callee_id, 'Status:', newCall.status);
          
          if (user && newCall.callee_id === user.id && newCall.status === 'ringing') {
            console.log('📞 Incoming call for me! Fetching booking details...');
            
            // Get booking details for caller name
            const { data: booking } = await supabase
              .from('bookings')
              .select('cust_name, worker_name')
              .eq('id', newCall.booking_id)
              .single();

            console.log('📞 Booking details:', booking);

            setIncomingCall({
              rtc_call_id: newCall.id,
              booking_id: newCall.booking_id,
              caller_name: booking?.cust_name || 'Someone',
            });

            console.log('📞 Playing notification sound...');
            // Play notification sound if available
            const audio = new Audio('/ding.mp3');
            audio.play().catch(console.error);
          }
        }
      )
      .subscribe((status) => {
        console.log('📞 Realtime subscription status:', status);
      });

    return () => {
      console.log('📞 Cleaning up incoming call listener');
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    incomingCall,
    clearIncomingCall: () => setIncomingCall(null),
  };
};
