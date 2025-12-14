import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth as firebaseAuth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { PortalStore } from '@/lib/portal';
import { isAdminPhone } from '@/features/auth/isAdmin';

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

    // Root path only: check Firebase auth state and redirect
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user) {
        console.log("[AuthGate] No Firebase user, redirecting to /auth");
        nav('/auth', { replace: true });
        setReady(true);
        return;
      }

      console.log("[AuthGate] Firebase user found:", user.uid);
      // Quick admin check using phone (no network call)
      const isAdmin = isAdminPhone(user.phoneNumber);
      const lastPortal = PortalStore.get();
      const dest = isAdmin && lastPortal === 'admin' ? '/admin' : '/home';
      
      nav(dest, { replace: true });
      setReady(true);
    });

    return () => unsubscribe();
  }, [nav, location.pathname]);

  if (!ready) return null;
  return <>{children}</>;
}