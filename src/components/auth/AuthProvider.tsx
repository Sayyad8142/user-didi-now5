import { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase';
import { getDemoSession, isDemoMode, clearDemoSession } from '@/lib/demo';

// Create a compatible user interface
interface AuthUser {
  id: string;
  phone?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
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
        setLoading(false);
      } else {
        setUser(null);
        setFirebaseUser(null);
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
        setLoading(false);
      }
    }

    // Listen for Firebase auth state changes
    const unsubscribe = onAuthStateChanged(firebaseAuth, (fbUser) => {
      if (!mounted) return;
      
      console.log('[AuthProvider] Firebase auth state changed:', fbUser?.uid ?? 'null');
      
      if (fbUser) {
        // Clear any demo sessions when we have a real user
        clearDemoSession();
        
        setFirebaseUser(fbUser);
        setUser({
          id: fbUser.uid,
          phone: fbUser.phoneNumber,
        });
      } else {
        // Check if we're in demo mode
        if (isDemoMode()) {
          const demoSession = getDemoSession();
          if (demoSession) {
            setUser(demoSession.user as AuthUser);
            setFirebaseUser(null);
          } else {
            setUser(null);
            setFirebaseUser(null);
          }
        } else {
          setUser(null);
          setFirebaseUser(null);
        }
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener('demo-mode-changed', handleDemoModeChange as EventListener);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
