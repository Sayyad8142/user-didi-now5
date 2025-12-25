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

    // Listen for demo mode changes
    const handleDemoModeChange = (_event: Event) => {
      if (!mounted) return;
      const demo = getDemoSession();
      if (demo) {
        setUser(demo.user as AuthUser);
        setFirebaseUser(null);
        setSession(null);
        setLoading(false);
      } else {
        setUser(null);
        setFirebaseUser(null);
        setSession(null);
        setLoading(false);
      }
    };
    window.addEventListener('demo-mode-changed', handleDemoModeChange as EventListener);

    // Check for demo mode first
    if (isDemoMode()) {
      const demoSession = getDemoSession();
      if (demoSession && mounted) {
        setUser(demoSession.user as AuthUser);
        setFirebaseUser(null);
        setSession(null);
        setLoading(false);
        return () => {
          mounted = false;
          window.removeEventListener('demo-mode-changed', handleDemoModeChange as EventListener);
        };
      }
    }

    // Listen for Firebase auth state changes
    const unsubscribe = onFirebaseAuthStateChanged((fbUser) => {
      if (!mounted) return;
      
      console.log('Firebase auth state changed:', fbUser?.uid);
      
      if (fbUser) {
        // Clear any demo sessions
        clearDemoSession();
        
        // Create compatible user object
        const authUser: AuthUser = {
          id: fbUser.uid,
          phone: fbUser.phoneNumber,
          email: fbUser.email,
        };
        
        setUser(authUser);
        setFirebaseUser(fbUser);
        setSession(null); // No Supabase session, using Firebase
      } else {
        setUser(null);
        setFirebaseUser(null);
        setSession(null);
      }
      
      setLoading(false);
    });

    // Check for existing Firebase user
    const currentUser = getCurrentUser();
    if (currentUser && mounted) {
      const authUser: AuthUser = {
        id: currentUser.uid,
        phone: currentUser.phoneNumber,
        email: currentUser.email,
      };
      setUser(authUser);
      setFirebaseUser(currentUser);
      setLoading(false);
    }

    return () => {
      mounted = false;
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
