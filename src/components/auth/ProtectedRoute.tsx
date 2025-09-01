import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Loader2 } from 'lucide-react';
import ConsentGate from '@/features/auth/ConsentGate';
import { hasAppAccess } from '@/lib/session';
import { isGuest } from '@/lib/guest';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [ok, setOk] = React.useState<boolean | null>(null);

  // Don't apply user auth protection to /admin routes - let AdminGate handle it
  if (location.pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const allowed = await hasAppAccess();
      if (!mounted) return;
      setOk(allowed);
      if (!allowed) navigate('/auth', { replace: true, state: { from: location } });
    })();
    return () => { mounted = false; };
  }, [location.pathname, navigate]);

  // Redirect guests from / to /home
  React.useEffect(() => {
    if (ok && isGuest() && location.pathname === '/') {
      navigate('/home', { replace: true });
    }
  }, [ok, location.pathname, navigate]);

  if ((loading || ok === null) && !user) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!ok) return null;

  if (!user) {
    // Guest mode allowed
    return <>{children}</>;
  }

  return (
    <ConsentGate>
      {children}
    </ConsentGate>
  );
}
