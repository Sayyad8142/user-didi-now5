import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { LogIn, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GuestPromptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GuestPromptSheet({ open, onOpenChange }: GuestPromptSheetProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleDemoLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: import.meta.env.VITE_DEMO_EMAIL,
        password: import.meta.env.VITE_DEMO_PASSWORD,
      });

      if (error) throw error;

      // Clear guest session
      localStorage.removeItem('guestSession');
      
      toast({
        title: 'Demo Login Successful',
        description: 'You can now try all features',
      });

      onOpenChange(false);
      navigate('/home');
    } catch (error: any) {
      toast({
        title: 'Demo Login Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSignIn = () => {
    // Clear guest session
    localStorage.removeItem('guestSession');
    onOpenChange(false);
    navigate('/auth');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sign in Required</SheetTitle>
          <SheetDescription>
            Please sign in to place a booking. Use Demo Login to try it instantly.
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-4 mt-6">
          <Button
            onClick={handleDemoLogin}
            className="w-full h-12 gradient-primary"
          >
            <Smartphone className="w-4 h-4 mr-2" />
            Use Demo Login
          </Button>
          
          <Button
            onClick={handleSignIn}
            variant="outline"
            className="w-full h-12"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Sign In
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}