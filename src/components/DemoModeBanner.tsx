import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LogIn, Beaker } from 'lucide-react';
import { isDemo } from '@/lib/demo';

export function DemoModeBanner() {
  const navigate = useNavigate();

  if (!isDemo()) return null;

  const handleSignIn = () => {
    navigate('/auth');
  };

  return (
    <Alert className="mx-4 mt-4 border-orange-200 bg-orange-50">
      <Beaker className="h-4 w-4 text-orange-600" />
      <AlertDescription className="flex items-center justify-between">
        <span className="text-sm text-orange-800">
          Demo Mode — some actions are disabled
        </span>
        <Button
          onClick={handleSignIn}
          size="sm"
          variant="outline"
          className="h-7 text-xs ml-2 border-orange-300 text-orange-700 hover:bg-orange-100"
        >
          <LogIn className="w-3 h-3 mr-1" />
          Sign In
        </Button>
      </AlertDescription>
    </Alert>
  );
}