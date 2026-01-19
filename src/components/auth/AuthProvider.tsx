import { createContext, useContext, useEffect, useState } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { User as FirebaseUser } from 'firebase/auth';
import { onFirebaseAuthStateChanged, getCurrentUser } from '@/lib/firebase';
import { getDemoSession, isDemoMode, clearDemoSession } from '@/lib/demo';

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  session: null,
  loading: true,
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

  useEffect(() => {
    let mounted = true;

    const applyDemoSession = () => {
      const demo = getDemoSession();
      if (demo) {
        setUser(demo.user as AuthUser);
        setFirebaseUser(null);
        setSession(null);
        setLoading(false);
        return true;
      }
      return false;
    };

    // Listen for demo/guest mode changes
    const handleDemoModeChange = (_event: Event) => {
      if (!mounted) return;

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
        setLoading(false);
        return;
      }

      // Otherwise, fall back to demo/guest if enabled
      if (!applyDemoSession()) {
        setUser(null);
        setFirebaseUser(null);
        setSession(null);
        setLoading(false);
      }
    };
    window.addEventListener('demo-mode-changed', handleDemoModeChange as EventListener);

    // Listen for Firebase auth state changes (ALWAYS, even if guest-mode is set)
    let authStateResolved = false;
    const unsubscribe = onFirebaseAuthStateChanged((fbUser) => {
      authStateResolved = true;
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
      setLoading(false);
    });

    // Initial hydration: if a Firebase user is already available, use it immediately.
    // IMPORTANT: If no currentUser is available yet, keep loading=true until
    // onFirebaseAuthStateChanged fires (prevents redirecting to /auth too early).
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
      setLoading(false);
    } else if (isDemoMode() && mounted) {
      // Only apply demo/guest if no Firebase session exists
      applyDemoSession();
    }

    // Safety: if Firebase never resolves (should be rare), don't freeze forever
    const safetyTimer = window.setTimeout(() => {
      if (!mounted) return;
      if (!authStateResolved && loading) {
        setLoading(false);
      }
    }, 1500);

    return () => {
      mounted = false;
      window.clearTimeout(safetyTimer);
      unsubscribe();
      window.removeEventListener('demo-mode-changed', handleDemoModeChange as EventListener);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
