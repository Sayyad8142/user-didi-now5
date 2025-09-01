import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LogIn, User } from 'lucide-react';
import { isGuest } from '@/lib/guest';

export function GuestBanner() {
  const navigate = useNavigate();

  if (!isGuest()) return null;

  const handleSignIn = () => {
    navigate('/auth');
  };

  return (
    <Alert className="mx-4 mt-4 border-primary/20 bg-primary/5">
      <User className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span className="text-sm">
          Browsing as Guest — sign in to book services
        </span>
        <Button
          onClick={handleSignIn}
          size="sm"
          variant="outline"
          className="h-7 text-xs ml-2"
        >
          <LogIn className="w-3 h-3 mr-1" />
          Sign In
        </Button>
      </AlertDescription>
    </Alert>
  );
}