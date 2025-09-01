import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useGuestGuard } from '@/hooks/useGuestGuard';

export function useBookingGuard() {
  const { isDemoUser } = useAuth();
  const { requireSignIn } = useGuestGuard();

  const checkAuthForBooking = () => {
    return requireSignIn();
  };

  return {
    checkAuthForBooking,
    isDemoUser,
  };
}