import { Navigate, useLocation } from 'react-router-dom';
import { isGuest } from '@/lib/guest';
import { useAuth } from '@/components/auth/AuthProvider';
import { Loader2 } from 'lucide-react';

export default function RequireAuth({ 
  children, 
  allowGuest = false 
}: { 
  children: JSX.Element; 
  allowGuest?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return children;
  if (allowGuest && isGuest()) return children;
  
  return <Navigate to="/auth" state={{ from: location }} replace />;
}