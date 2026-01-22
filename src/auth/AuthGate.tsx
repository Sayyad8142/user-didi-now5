import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PortalStore } from '@/lib/portal';
import { isAdminPhone } from '@/features/auth/isAdmin';
import { onFirebaseAuthStateChanged } from '@/lib/firebase';
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
    // If we're on an auth entry route but the user is already logged in,
    // redirect away once Firebase finishes hydrating the persisted session.
    // This prevents getting "stuck" on /auth due to a transient null auth state
    // during cold start.
    const authEntryRoutes = ['/auth', '/auth/verify', '/admin-login', '/admin-verify'];
    if (authEntryRoutes.some(r => location.pathname.startsWith(r))) {
      setReady(true);

      // Demo mode shortcut
      if (isDemoMode()) {
        const demoSession = getDemoSession();
        if (demoSession) {
          nav('/home', { replace: true });
          return;
        }
      }

      let cancelled = false;
      const unsubscribe = onFirebaseAuthStateChanged((user) => {
        if (cancelled) return;
        if (!user) return;

        const isAdmin = isAdminPhone(user.phoneNumber);
        const lastPortal = PortalStore.get();
        const dest = isAdmin && lastPortal === 'admin' ? '/admin' : '/home';
        nav(dest, { replace: true });
      });

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    // Allow legal/public routes immediately - no auth check needed
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

    // Root path: ALWAYS wait for Firebase auth state to be determined
    // This fixes the race condition where getCurrentUser() returns null on cold start
    // because Firebase hasn't loaded persisted session yet
    let cancelled = false;

    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      if (cancelled) return;

      if (!user) {
        nav('/auth', { replace: true });
        setReady(true);
        return;
      }

      // Quick admin check using phone
      const isAdmin = isAdminPhone(user.phoneNumber);
      const lastPortal = PortalStore.get();
      const dest = isAdmin && lastPortal === 'admin' ? '/admin' : '/home';
      
      nav(dest, { replace: true });
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
