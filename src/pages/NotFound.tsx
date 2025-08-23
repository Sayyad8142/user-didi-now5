import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div className="text-center max-w-sm gradient-card rounded-2xl p-8 shadow-card">
        <h1 className="text-4xl font-bold mb-4 text-foreground">404</h1>
        <p className="text-xl text-muted-foreground mb-4">Oops! Page not found</p>
        <Link to="/" className="text-primary hover:text-primary-dark underline transition-smooth">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
