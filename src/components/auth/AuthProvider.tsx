import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { User as FirebaseUser } from 'firebase/auth';
import { onFirebaseAuthStateChanged, getCurrentUser } from '@/lib/firebase';
import { getDemoSession, isDemoMode, clearDemoSession, isGuestMode } from '@/lib/demo';

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
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
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
    console.log('🔑 AuthProvider init (Twilio OTP + Firebase custom token)');
    import('@/lib/perfMarks').then(({ mark }) => mark('auth.provider.init'));

    const handleDemoModeChange = (event: Event) => {
      if (!mounted) return;
      const detail = (event as CustomEvent).detail;
      const currentFb = getCurrentUser();
      if (currentFb) {
        clearDemoSession();
        setUser({ id: currentFb.uid, phone: currentFb.phoneNumber, email: currentFb.email });
        setFirebaseUser(currentFb);
        setSession(null); setIsGuest(false); setLoading(false);
        return;
      }
      if (detail?.enabled) {
        if (!applyDemoSession()) {
          setTimeout(() => { if (mounted) applyDemoSession(); }, 10);
        }
      } else {
        setUser(null); setFirebaseUser(null); setSession(null);
        setIsGuest(false); setLoading(false);
      }
    };
    window.addEventListener('demo-mode-changed', handleDemoModeChange as EventListener);

    // Single source of truth: Firebase Web SDK auth state (works in browser
    // and inside Capacitor WebView — Twilio mints a custom token, then
    // signInWithCustomToken populates this listener).
    const unsubscribe = onFirebaseAuthStateChanged((fbUser) => {
      if (!mounted) return;
      console.log('🌐 Firebase auth state changed:', fbUser?.uid);
      import('@/lib/perfMarks').then(({ mark }) => mark(`auth.firebase.state(${fbUser ? 'user' : 'null'})`));

      if (fbUser) {
        clearDemoSession();
        setUser({ id: fbUser.uid, phone: fbUser.phoneNumber, email: fbUser.email });
        setFirebaseUser(fbUser);
        setSession(null); setIsGuest(false); setLoading(false);
        return;
      }

      if (isDemoMode()) {
        if (applyDemoSession()) return;
      }
      setUser(null); setFirebaseUser(null); setSession(null);
      setIsGuest(false); setLoading(false);
    });

    // Initial hydration
    const currentUser = getCurrentUser();
    if (currentUser && mounted) {
      clearDemoSession();
      setUser({ id: currentUser.uid, phone: currentUser.phoneNumber, email: currentUser.email });
      setFirebaseUser(currentUser);
      setSession(null); setIsGuest(false); setLoading(false);
    } else if (isDemoMode() && mounted) {
      if (!applyDemoSession()) setLoading(false);
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
