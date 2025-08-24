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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="mb-6">
          <img
            src="/lovable-uploads/99eb2646-dd7d-41ce-929e-7d27abfe2f37.png"
            alt="Didi Now - Your maid on leave today? No worry, we will send maid in 10mins"
            className="w-full rounded-2xl shadow-card mb-6"
            loading="lazy"
            decoding="async"
            onLoad={() => console.log('Image loaded successfully')}
            onError={(e) => {
              console.error('Image failed to load:', e);
              // Fallback to a placeholder or retry
              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzY0NzQ4YiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkRpZGkgTm93PC90ZXh0Pjwvc3ZnPg==';
            }}
            style={{
              aspectRatio: '4/3',
              objectFit: 'cover',
              background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)'
            }}
          />
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
