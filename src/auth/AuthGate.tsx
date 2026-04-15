import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onFirebaseAuthStateChanged, getNativeCurrentUser, isNativePlatform } from '@/lib/firebase';
import { isDemoMode, getDemoSession } from '@/lib/demo';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  // Hide splash screen when ready
  useEffect(() => {
    if (ready && typeof window !== 'undefined' && (window as any).hideSplash) {
      (window as any).hideSplash();
    }
  }, [ready]);

  useEffect(() => {
    const native = isNativePlatform();
    const authEntryRoutes = ['/auth', '/auth/verify'];

    if (authEntryRoutes.some(r => location.pathname.startsWith(r))) {
      setReady(true);

      // Demo/guest users should be allowed to reach the auth page
      // (they clicked "Create Account") — skip the redirect
      if (isDemoMode()) {
        return;
      }

      if (native) {
        // Native: check native plugin for existing user
        getNativeCurrentUser().then((nativeUser) => {
          if (nativeUser) {
            console.log('📱 AuthGate: native user found on auth page, redirecting');
            nav('/home', { replace: true });
          }
        });
        return;
      }

      // Web: listen for web SDK auth state
      let cancelled = false;
      const unsubscribe = onFirebaseAuthStateChanged((user) => {
        if (cancelled) return;
        if (!user) return;
        nav('/home', { replace: true });
      });

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    // Allow legal/public routes immediately
    const publicRoutes = ['/legal', '/legal/privacy', '/legal/terms'];
    if (publicRoutes.some(r => location.pathname.startsWith(r))) {
      setReady(true);
      return;
    }

    // Non-root paths: show content immediately, let ProtectedRoute handle auth
    if (location.pathname !== '/') {
      setReady(true);
      return;
    }

    // Check for demo mode first
    if (isDemoMode()) {
      const demoSession = getDemoSession();
      if (demoSession) {
        nav('/home', { replace: true });
        setReady(true);
        return;
      }
    }

    // Root path: determine auth state and redirect
    if (native) {
      // Native: check native plugin
      getNativeCurrentUser().then((nativeUser) => {
        if (nativeUser) {
          console.log('📱 AuthGate: native user found at root, redirecting to /home');
          nav('/home', { replace: true });
        } else {
          console.log('📱 AuthGate: no native user, redirecting to /auth');
          nav('/auth', { replace: true });
        }
        setReady(true);
      });
      return;
    }

    // Web: wait for Firebase web SDK auth state
    let cancelled = false;
    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      if (cancelled) return;

      if (!user) {
        nav('/auth', { replace: true });
        setReady(true);
        return;
      }

      nav('/home', { replace: true });
      setReady(true);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [nav, location.pathname]);

  if (!ready) return null;
  return <>{children}</>;
}
