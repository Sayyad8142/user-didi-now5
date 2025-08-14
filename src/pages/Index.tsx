import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-4">Didi Now</h1>
          <p className="text-xl text-muted-foreground mb-2">in 10Mins</p>
          <p className="text-sm text-muted-foreground">
            Your neighborhood delivery service
          </p>
        </div>
        
        <Button 
          onClick={() => window.location.href = '/auth'}
          className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02]"
        >
          Get Started
        </Button>
      </div>
    </div>
  );
};

export default Index;
