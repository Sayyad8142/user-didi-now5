import { useAuth } from "@/components/auth/AuthProvider";
import { Navigate } from "react-router-dom";

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="animate-pulse">
          <div className="w-8 h-8 bg-primary/20 rounded-full"></div>
        </div>
      </div>
    );
  }

  // Redirect authenticated users to home
  if (user) {
    return <Navigate to="/home" replace />;
  }

  // Redirect unauthenticated users to auth
  return <Navigate to="/auth" replace />;
};

export default Index;
