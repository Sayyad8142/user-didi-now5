import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile } from '@/features/profile/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { User, Phone, Building, Home, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Profile() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
      toast({
        title: 'Signed out successfully',
        description: 'You have been logged out of your account',
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: 'Error',
        description: 'Failed to sign out',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg pb-24">
        <div className="max-w-md mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-32 mx-auto" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg pb-24">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">Profile</h1>
          <p className="text-muted-foreground">Your account information</p>
        </div>

        <Card className="shadow-card border-pink-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{profile?.full_name}</h3>
                <p className="text-sm text-muted-foreground">User Profile</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Phone className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Phone Number</p>
                <p className="text-sm text-muted-foreground">{profile?.phone}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Building className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Community</p>
                <p className="text-sm text-muted-foreground">{profile?.community}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <Home className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Flat Number</p>
                <p className="text-sm text-muted-foreground">{profile?.flat_no}</p>
              </div>
            </div>

            <Button 
              onClick={handleSignOut}
              variant="outline" 
              className="w-full mt-6 text-red-600 border-red-200 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}