import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to sign out',
        variant: 'destructive',
      });
    } else {
      navigate('/auth');
    }
  };

  return (
    <div className="min-h-screen gradient-bg p-4">
      <div className="max-w-md mx-auto pt-8">
        <Card className="shadow-card border-pink-100 gradient-card backdrop-blur-sm">
          <CardContent className="p-6 text-center">
            <h1 className="text-3xl font-bold text-primary mb-2">Didi Now</h1>
            <p className="text-muted-foreground mb-8">Welcome to your dashboard!</p>
            
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                🎉 Authentication successful! Your Didi Now app is ready.
              </p>
              
              <Button
                onClick={handleSignOut}
                variant="outline"
                className="w-full rounded-full"
              >
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}