import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { User as FirebaseUser } from 'firebase/auth';
import {
  onFirebaseAuthStateChanged,
  getCurrentUser,
  getNativeCurrentUser,
  isNativePlatform,
  NativeAuthUser,
} from '@/lib/firebase';
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

  // Set auth state from a native user
  const applyNativeUser = useCallback((nativeUser: NativeAuthUser) => {
    console.log('📱 AuthProvider: applying native user:', nativeUser.uid);
    clearDemoSession();
    const authUser: AuthUser = {
      id: nativeUser.uid,
      phone: nativeUser.phoneNumber,
      email: null,
    };
    setUser(authUser);
    setFirebaseUser(null); // No web SDK FirebaseUser on native
    setSession(null);
    setIsGuest(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    const native = isNativePlatform();

    console.log(`🔑 AuthProvider init — platform: ${native ? 'native' : 'web'}`);

    // ─── Demo/guest mode listener (shared) ─────────────────────
    const handleDemoModeChange = (event: Event) => {
      if (!mounted) return;
      const customEvent = event as CustomEvent;
      console.log('🔄 Demo mode changed:', customEvent.detail);

      if (native) {
        // On native, check native current user first
        getNativeCurrentUser().then((nu) => {
          if (!mounted) return;
          if (nu) {
            applyNativeUser(nu);
            return;
          }
          if (customEvent.detail?.enabled) {
            applyDemoSession();
          } else {
            setUser(null); setFirebaseUser(null); setSession(null);
            setIsGuest(false); setLoading(false);
          }
        });
        return;
      }

      // Web path
      const currentFb = getCurrentUser();
      if (currentFb) {
        clearDemoSession();
        setUser({ id: currentFb.uid, phone: currentFb.phoneNumber, email: currentFb.email });
        setFirebaseUser(currentFb);
        setSession(null); setIsGuest(false); setLoading(false);
        return;
      }
      if (customEvent.detail?.enabled) {
        if (!applyDemoSession()) {
          setTimeout(() => { if (mounted) applyDemoSession(); }, 10);
        }
      } else {
        setUser(null); setFirebaseUser(null); setSession(null);
        setIsGuest(false); setLoading(false);
      }
    };
    window.addEventListener('demo-mode-changed', handleDemoModeChange as EventListener);

    // ─── NATIVE platform: use native plugin as source of truth ──
    if (native) {
      // Check native current user on startup
      getNativeCurrentUser().then((nativeUser) => {
        if (!mounted) return;
        if (nativeUser) {
          applyNativeUser(nativeUser);
          return;
        }
        // No native user — check demo/guest
        if (isDemoMode()) {
          if (applyDemoSession()) return;
        }
        console.log('📱 AuthProvider: no native user, no demo — unauthenticated');
        setUser(null); setFirebaseUser(null); setSession(null);
        setIsGuest(false); setLoading(false);
      });

      // Also poll native auth state when app resumes (handles token refresh)
      const handleNativeAuthCheck = () => {
        getNativeCurrentUser().then((nu) => {
          if (!mounted) return;
          if (nu) {
            applyNativeUser(nu);
          } else {
            // User signed out natively
            setUser(null); setFirebaseUser(null); setSession(null);
            setIsGuest(false); setLoading(false);
          }
        });
      };
      // Listen for custom event dispatched after native OTP verify
      window.addEventListener('native-auth-changed', handleNativeAuthCheck);

      return () => {
        mounted = false;
        window.removeEventListener('demo-mode-changed', handleDemoModeChange as EventListener);
        window.removeEventListener('native-auth-changed', handleNativeAuthCheck);
      };
    }

    // ─── WEB platform: use Firebase Web SDK onAuthStateChanged ──
    const unsubscribe = onFirebaseAuthStateChanged((fbUser) => {
      if (!mounted) return;
      console.log('🌐 Firebase auth state changed:', fbUser?.uid);

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

    // Initial hydration (web)
    const currentUser = getCurrentUser();
    if (currentUser && mounted) {
      clearDemoSession();
      setUser({ id: currentUser.uid, phone: currentUser.phoneNumber, email: currentUser.email });
      setFirebaseUser(currentUser);
      setSession(null); setIsGuest(false); setLoading(false);
    } else if (isDemoMode() && mounted) {
      if (!applyDemoSession()) {
        setLoading(false);
      }
    }

    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener('demo-mode-changed', handleDemoModeChange as EventListener);
    };
  }, [applyDemoSession, applyNativeUser]);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, session, loading, isGuest }}>
      {children}
    </AuthContext.Provider>
  );
}
