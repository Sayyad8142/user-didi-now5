import { AuthCard } from '@/components/auth/AuthCard';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';

export default function Auth() {
  const { user, loading } = useAuth();

  // Only redirect authenticated users, let guest button handle guest redirect
  if (!loading && user) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <AuthCard />
    </div>
  );
}