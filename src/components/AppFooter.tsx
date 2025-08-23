import { Link } from "react-router-dom";

export function AppFooter() {
  return (
    <footer className="border-t bg-background mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h3 className="font-semibold text-foreground">Didi Now</h3>
            <p className="text-sm text-muted-foreground">Your neighborhood delivery service</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6">
            <Link 
              to="/legal/privacy" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <Link 
              to="/legal/terms" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t text-center">
          <p className="text-xs text-muted-foreground">
            © 2024 Didi Now. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}