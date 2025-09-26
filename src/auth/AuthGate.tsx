import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PortalStore } from '@/lib/portal';
import { isAdminPhone } from '@/features/auth/isAdmin';

async function fetchUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin, phone')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Only run AuthGate on initial load (not on every route change)
      // Also skip if user is explicitly navigating to home page "/"
      if (location.pathname !== '/' && ready) return;
      
      // Allow users to navigate to the home page regardless of portal state
      if (location.pathname === '/' && ready) {
        return;
      }

      // 1) Hydrate Supabase session from storage
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        // No session at all → respect last portal and show its login
        const portal = PortalStore.get() || 'user';
        nav(portal === 'admin' ? '/admin-login' : '/auth', { replace: true });
        if (!cancelled) setReady(true);
        return;
      }

      // 2) We have a session → determine where to land
      const lastPortal = PortalStore.get();
      let isAdmin = false;

      try {
        const profile = await fetchUserProfile(session.user.id);
        isAdmin = profile?.is_admin || isAdminPhone(profile?.phone || session.user.phone);
      } catch {
        // if profile fetch fails, fall back to phone check
        isAdmin = isAdminPhone(session.user.phone);
      }

      // Priority order for initial route:
      // A) lastPortal if set and allowed by role
      // B) role-based default
      let dest = '/home';
      if (lastPortal === 'admin' && isAdmin) {
        dest = '/admin';
      } else if (isAdmin) {
        dest = '/admin';
      } else {
        dest = '/home';
      }

      nav(dest, { replace: true });
      if (!cancelled) setReady(true);
    })();

    return () => { cancelled = true; };
  }, [nav, location.pathname, ready]);

  // Block rendering until we decide the first route (prevents brief user-login flash)
  if (!ready) return null;
  return <>{children}</>;
}