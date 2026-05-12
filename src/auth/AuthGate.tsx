import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onFirebaseAuthStateChanged } from '@/lib/firebase';
import { isDemoMode, getDemoSession } from '@/lib/demo';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready && typeof window !== 'undefined' && (window as any).hideSplash) {
      (window as any).hideSplash();
    }
  }, [ready]);

  useEffect(() => {
    const authEntryRoutes = ['/auth', '/auth/verify'];

    if (authEntryRoutes.some((r) => location.pathname.startsWith(r))) {
      setReady(true);

      // Demo/guest users are allowed to reach the auth page
      if (isDemoMode()) return;

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
    if (publicRoutes.some((r) => location.pathname.startsWith(r))) {
      setReady(true);
      return;
    }

    // Non-root paths: show content immediately, let ProtectedRoute handle auth
    if (location.pathname !== '/') {
      setReady(true);
      return;
    }

    // Demo first
    if (isDemoMode()) {
      const demoSession = getDemoSession();
      if (demoSession) {
        nav('/home', { replace: true });
        setReady(true);
        return;
      }
    }

    // Root path: wait for Firebase Web SDK auth state
    let cancelled = false;
    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      if (cancelled) return;
      nav(user ? '/home' : '/auth', { replace: true });
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
