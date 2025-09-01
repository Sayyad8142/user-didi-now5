import { useState, useEffect } from 'react';
import { useAuth as useSupabaseAuth } from '@/components/auth/AuthProvider';
import { isGuest as isGuestFlag } from '@/lib/guest';

export interface GuestSession {
  isGuest: true;
  user: null;
  session: null;
}

export interface AuthenticatedSession {
  isGuest: false;
  user: any;
  session: any;
}

export type AuthSession = GuestSession | AuthenticatedSession;

export function useAuth(): AuthSession & { loading: boolean; isDemoUser: boolean } {
  const { user, session, loading } = useSupabaseAuth();
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    // Detect guest mode using helper and only when no authenticated user
    setIsGuest(isGuestFlag() && !user);
  }, [user]);

  const isDemoUser = user?.email === import.meta.env.VITE_DEMO_EMAIL;

  if (isGuest) {
    return {
      isGuest: true,
      user: null,
      session: null,
      loading,
      isDemoUser: false,
    };
  }

  return {
    isGuest: false,
    user,
    session,
    loading,
    isDemoUser,
  };
}