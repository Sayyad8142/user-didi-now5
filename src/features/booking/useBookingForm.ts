import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { GuestPromptSheet } from '@/components/GuestPromptSheet';

export function useBookingGuard() {
  const { isGuest, isDemoUser } = useAuth();
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

  const checkAuthForBooking = () => {
    if (isGuest) {
      setShowGuestPrompt(true);
      return false;
    }
    return true;
  };

  return {
    checkAuthForBooking,
    showGuestPrompt,
    setShowGuestPrompt,
    isDemoUser,
  };
}