import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { User as FirebaseUser } from 'firebase/auth';
import { onFirebaseAuthStateChanged, getCurrentUser } from '@/lib/firebase';
import { getDemoSession, isDemoMode, clearDemoSession, isGuestMode } from '@/lib/demo';

// Create a compatible user type that works with both systems
interface AuthUser {
  id: string;
  phone?: string | null;
  email?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  firebaseUser: FirebaseUser | null;
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  session: null,
  loading: true,
  isGuest: false,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const applyDemoSession = useCallback(() => {
    const demo = getDemoSession();
    if (demo) {
      console.log('✅ Applying guest/demo session:', demo.user.id);
      setUser(demo.user as AuthUser);
      setFirebaseUser(null);
      setSession(null);
      setIsGuest(isGuestMode());
      setLoading(false);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let mounted = true;

    // Listen for demo/guest mode changes
    const handleDemoModeChange = (event: Event) => {
      if (!mounted) return;
      
      const customEvent = event as CustomEvent;
      console.log('🔄 Demo mode changed:', customEvent.detail);

      // If there's a real Firebase user, never show demo/guest
      const currentFb = getCurrentUser();
      if (currentFb) {
        clearDemoSession();
        const authUser: AuthUser = {
          id: currentFb.uid,
          phone: currentFb.phoneNumber,
          email: currentFb.email,
        };
        setUser(authUser);
        setFirebaseUser(currentFb);
        setSession(null);
        setIsGuest(false);
        setLoading(false);
        return;
      }

      // Otherwise, apply demo/guest if enabled
      if (customEvent.detail?.enabled) {
        // Immediately try to apply the session
        if (!applyDemoSession()) {
          // Session not yet in localStorage, retry after a tick
          setTimeout(() => {
            if (mounted) applyDemoSession();
          }, 10);
        }
      } else {
        setUser(null);
        setFirebaseUser(null);
        setSession(null);
        setIsGuest(false);
        setLoading(false);
      }
    };
    window.addEventListener('demo-mode-changed', handleDemoModeChange as EventListener);

    // Listen for Firebase auth state changes (ALWAYS, even if guest-mode is set)
    const unsubscribe = onFirebaseAuthStateChanged((fbUser) => {
      if (!mounted) return;

      console.log('Firebase auth state changed:', fbUser?.uid);

      if (fbUser) {
        // A real login should always override any guest/demo state
        clearDemoSession();

        const authUser: AuthUser = {
          id: fbUser.uid,
          phone: fbUser.phoneNumber,
          email: fbUser.email,
        };

        setUser(authUser);
        setFirebaseUser(fbUser);
        setSession(null);
        setIsGuest(false);
        setLoading(false);
        return;
      }

      // No Firebase user: use demo/guest if enabled, else null
      if (isDemoMode()) {
        if (applyDemoSession()) return;
      }

      setUser(null);
      setFirebaseUser(null);
      setSession(null);
      setIsGuest(false);
      setLoading(false);
    });

    // Initial hydration - check synchronously first
    const currentUser = getCurrentUser();
    if (currentUser && mounted) {
      clearDemoSession();
      const authUser: AuthUser = {
        id: currentUser.uid,
        phone: currentUser.phoneNumber,
        email: currentUser.email,
      };
      setUser(authUser);
      setFirebaseUser(currentUser);
      setSession(null);
      setIsGuest(false);
      setLoading(false);
    } else if (isDemoMode() && mounted) {
      // Only apply demo/guest if no Firebase session exists
      if (!applyDemoSession()) {
        // Demo mode flag is set but no session data - still stop loading
        setLoading(false);
      }
    } else if (mounted) {
      // No Firebase user and no demo mode - just stop loading
      setLoading(false);
    }

    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener('demo-mode-changed', handleDemoModeChange as EventListener);
    };
  }, [applyDemoSession]);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, session, loading, isGuest }}>
      {children}
    </AuthContext.Provider>
  );
}
