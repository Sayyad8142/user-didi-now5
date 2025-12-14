import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { auth as firebaseAuth } from '@/lib/firebase';

export interface IncomingCallData {
  rtc_call_id: string;
  booking_id: string;
  caller_name?: string;
}

export const useIncomingRtcPush = () => {
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasInteracted = useRef(false);

  // Track user interaction for autoplay
  useEffect(() => {
    const trackInteraction = () => {
      hasInteracted.current = true;
    };
    
    document.addEventListener('click', trackInteraction);
    document.addEventListener('touchstart', trackInteraction);
    
    return () => {
      document.removeEventListener('click', trackInteraction);
      document.removeEventListener('touchstart', trackInteraction);
    };
  }, []);

  useEffect(() => {
    const setupIncomingCallListener = async () => {
      console.log('📞 Setting up incoming call listener...');
      
      const user = firebaseAuth.currentUser;
      if (!user) {
        console.log('📞 No authenticated user, skipping setup');
        return;
      }

      // Subscribe to rtc_calls filtered by callee_id
      const channel = supabase
        .channel('incoming-rtc-calls')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'rtc_calls',
            filter: `callee_id=eq.${user.uid}`,
          },
          async (payload) => {
            console.log('📞 RTC call received:', payload);
            const newCall = payload.new as any;
            
            // Accept both 'ringing' and 'initiated' for migration compatibility
            if (newCall.status === 'ringing' || newCall.status === 'initiated') {
              console.log('📞 Incoming call for me! Fetching booking details...');
              
              // Get booking details for caller name
              const { data: booking } = await supabase
                .from('bookings')
                .select('cust_name, worker_name')
                .eq('id', newCall.booking_id)
                .single();

              console.log('📞 Booking details:', booking);

              const callerName = booking?.cust_name || 'Someone';

              const callData = {
                rtc_call_id: newCall.id,
                booking_id: newCall.booking_id,
                caller_name: callerName,
              };
              
              console.log('📞 Setting incoming call state:', callData);
              setIncomingCall(callData);
              console.log('📞 Incoming call state set successfully');

              // Vibrate pattern
              if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200, 100, 200]);
              }

              // Show browser notification if permission granted
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Incoming Call', {
                  body: `${callerName} is calling...`,
                  icon: '/favicon.ico',
                  tag: 'incoming-call',
                  requireInteraction: true,
                });
              }

              // Play ringtone only if user has interacted
              if (hasInteracted.current) {
                console.log('📞 Playing notification sound...');
                audioRef.current = new Audio('/ding.mp3');
                audioRef.current.loop = true;
                audioRef.current.play().catch((err) => {
                  console.warn('📞 Could not autoplay ringtone:', err);
                });
              } else {
                console.log('📞 Skipping autoplay (no user interaction yet)');
              }
            }
          }
        )
        .subscribe((status) => {
          console.log('📞 Realtime subscription status:', status);
        });

      return () => {
        console.log('📞 Cleaning up incoming call listener');
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        supabase.removeChannel(channel);
      };
    };

    setupIncomingCallListener();
  }, []);

  return {
    incomingCall,
    clearIncomingCall: () => {
      // Stop ringtone when clearing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIncomingCall(null);
    },
  };
};
