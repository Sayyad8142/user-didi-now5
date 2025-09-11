import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { CleaningPulse } from '@/components/ui/cleaning-loader';
import ConsentGate from '@/features/auth/ConsentGate';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
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

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return (
    <ConsentGate>
      {children}
    </ConsentGate>
  );
}