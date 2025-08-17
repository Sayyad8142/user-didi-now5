import { useEffect, useRef } from "react";

// Function to create a short beep sound
function playBeep() {
  try {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = "square";
    oscillator.frequency.value = 880; // A5 note
    gainNode.gain.value = 0.05; // Low volume
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.18); // Short beep
  } catch (error) {
    console.warn("Unable to play audio alert:", error);
  }
}

export function useOverdueAlert(bookings: any[], slaMinutes: number) {
  const alertedBookings = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    const checkOverdueBookings = () => {
      const cutoffTime = Date.now() - (slaMinutes * 60 * 1000);
      
      for (const booking of bookings) {
        if (booking.status !== "pending") continue;
        
        const bookingId = booking.id as string;
        if (!bookingId) continue;
        
        const createdTime = new Date(booking.created_at).getTime();
        const isOverdue = createdTime <= cutoffTime;
        
        // If booking is overdue and we haven't alerted for it yet
        if (isOverdue && !alertedBookings.current.has(bookingId)) {
          alertedBookings.current.add(bookingId);
          playBeep();
        }
        
        // Clean up alerts for bookings that are no longer pending
        if (booking.status !== "pending") {
          alertedBookings.current.delete(bookingId);
        }
      }
    };

    // Check immediately
    checkOverdueBookings();
    
    // Then check every 15 seconds
    const interval = setInterval(checkOverdueBookings, 15000);
    
    return () => clearInterval(interval);
  }, [bookings, slaMinutes]);
  
  // Clean up alerts when bookings change
  useEffect(() => {
    const currentBookingIds = new Set(bookings.map(b => b.id));
    const alertedIds = Array.from(alertedBookings.current);
    
    // Remove alerts for bookings that no longer exist
    alertedIds.forEach(id => {
      if (!currentBookingIds.has(id)) {
        alertedBookings.current.delete(id);
      }
    });
  }, [bookings]);
}