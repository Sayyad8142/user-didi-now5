import { AuthCard } from '@/components/auth/AuthCard';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { isGuest } from '@/lib/guest';

export default function Auth() {
  const { user, loading } = useAuth();

  // Redirect authenticated users or if guest flag is set
  if (!loading && (user || isGuest())) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <AuthCard />
    </div>
  );
}