import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { CleaningPulse } from '@/components/ui/cleaning-loader';

import { isDemoMode } from '@/lib/demo';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, firebaseUser, loading } = useAuth();
  const location = useLocation();

  // Don't apply user auth protection to /admin routes - let AdminGate handle it
  if (location.pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <CleaningPulse size="lg" />
      </div>
    );
  }

  // Guest/Demo users are allowed through protected areas.
  // This prevents a redirect loop while AuthProvider hydrates from localStorage.
  // Treat a present Firebase user as authenticated even if our derived `user`
  // hasn't hydrated yet (prevents sporadic /auth redirects during transitions).
  if (!user && !firebaseUser && !isDemoMode()) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}