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
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Skip if already checked or not on root path
    if (checked) return;
    
    // Allow public routes immediately
    const publicRoutes = ['/auth', '/admin-login', '/auth/verify', '/admin-verify', '/legal', '/legal/privacy', '/legal/terms'];
    if (publicRoutes.some(r => location.pathname.startsWith(r))) {
      setReady(true);
      setChecked(true);
      return;
    }

    // Only redirect from root path
    if (location.pathname !== '/') {
      setReady(true);
      setChecked(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        nav('/auth', { replace: true });
        if (!cancelled) { setReady(true); setChecked(true); }
        return;
      }

      // Quick admin check - use phone first (no network call)
      let isAdmin = isAdminPhone(session.user.phone);
      
      if (!isAdmin) {
        try {
          const profile = await fetchUserProfile(session.user.id);
          isAdmin = profile?.is_admin || false;
        } catch {
          // Ignore - use phone check result
        }
      }

      const lastPortal = PortalStore.get();
      const dest = (isAdmin && lastPortal === 'admin') || isAdmin ? '/admin' : '/home';
      
      nav(dest, { replace: true });
      if (!cancelled) { setReady(true); setChecked(true); }
    })();

    return () => { cancelled = true; };
  }, [nav, location.pathname, checked]);

  if (!ready) return null;
  return <>{children}</>;
}