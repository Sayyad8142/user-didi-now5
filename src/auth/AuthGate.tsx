import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PortalStore } from '@/lib/portal';

async function fetchIsAdmin(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data?.is_admin === true;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeRoute = async () => {
      try {
        // 1) Hydrate Supabase session from storage
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // No session at all → only redirect if we're on the root path
          // Let users stay on auth/admin-login pages they navigate to directly
          const currentPath = window.location.pathname;
          if (currentPath === '/') {
            const portal = PortalStore.get() || 'user';
            nav(portal === 'admin' ? '/admin-login' : '/auth', { replace: true });
          }
          if (!cancelled) setReady(true);
          return;
        }

        // 2) We have a session → determine where to land
        const lastPortal = PortalStore.get();
        let isAdmin = false;

        try {
          isAdmin = await fetchIsAdmin(session.user.id);
        } catch {
          // if profile fetch fails, fall back to last portal
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

        // Only redirect if we're on auth pages or root
        const currentPath = window.location.pathname;
        if (currentPath === '/' || currentPath === '/auth' || currentPath === '/admin-login') {
          nav(dest, { replace: true });
        }
        if (!cancelled) setReady(true);
      } catch (error) {
        console.error('AuthGate initialization error:', error);
        nav('/auth', { replace: true });
        if (!cancelled) setReady(true);
      }
    };

    initializeRoute();
    return () => { cancelled = true; };
  }, [nav]);

  // Block rendering until we decide the first route (prevents brief flash)
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return <>{children}</>;
}