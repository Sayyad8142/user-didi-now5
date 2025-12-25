import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PortalStore } from '@/lib/portal';
import { isAdminPhone } from '@/features/auth/isAdmin';
import { onFirebaseAuthStateChanged, getCurrentUser } from '@/lib/firebase';
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
    // Allow public routes immediately - no auth check needed
    const publicRoutes = ['/auth', '/admin-login', '/auth/verify', '/admin-verify', '/legal', '/legal/privacy', '/legal/terms'];
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

    // Check for existing Firebase user first (faster than listener)
    const currentUser = getCurrentUser();
    if (currentUser) {
      const isAdmin = isAdminPhone(currentUser.phoneNumber);
      const lastPortal = PortalStore.get();
      const dest = isAdmin && lastPortal === 'admin' ? '/admin' : '/home';
      nav(dest, { replace: true });
      setReady(true);
      return;
    }

    // Root path: listen for Firebase auth state
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
