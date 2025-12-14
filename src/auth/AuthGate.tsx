import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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

    // Root path only: check session and redirect
    let cancelled = false;

    // Use auth state listener instead of getSession to avoid duplicate calls
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      
      // Only act on initial session or sign in
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return;

      if (!session?.user) {
        nav('/auth', { replace: true });
        setReady(true);
        return;
      }

      // Quick admin check using phone (no network call)
      const isAdmin = isAdminPhone(session.user.phone);
      const lastPortal = PortalStore.get();
      const dest = isAdmin && lastPortal === 'admin' ? '/admin' : '/home';
      
      nav(dest, { replace: true });
      setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [nav, location.pathname]);

  if (!ready) return null;
  return <>{children}</>;
}