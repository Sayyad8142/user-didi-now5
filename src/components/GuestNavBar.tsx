import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogIn } from 'lucide-react';

export function GuestNavBar() {
  const navigate = useNavigate();

  const handleSignIn = () => {
    localStorage.removeItem('guestSession');
    navigate('/auth');
  };

  return (
    <div className="flex items-center justify-between p-4 bg-background border-b">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          Guest
        </Badge>
        <span className="text-sm text-muted-foreground">
          Browsing mode
        </span>
      </div>
      
      <Button
        onClick={handleSignIn}
        size="sm"
        variant="outline"
        className="h-8"
      >
        <LogIn className="w-3 h-3 mr-1" />
        Sign In
      </Button>
    </div>
  );
}