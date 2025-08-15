import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfile } from '@/features/profile/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { User, Phone, Building, Home, LogOut, Settings, Bell, Shield } from 'lucide-react';
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
        <div className="max-w-md mx-auto px-4 py-8 space-y-6">
          <div className="text-center space-y-4">
            <Skeleton className="h-20 w-20 rounded-full mx-auto" />
            <Skeleton className="h-6 w-40 mx-auto" />
            <Skeleton className="h-4 w-24 mx-auto" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  // Get user initials for avatar fallback
  const getInitials = (name: string = '') => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen gradient-bg pb-24">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        {/* Header Section with Avatar */}
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <Avatar className="h-20 w-20 shadow-card transition-spring hover:scale-105">
              <AvatarImage src="" alt={profile?.full_name || 'User'} />
              <AvatarFallback className="gradient-primary text-white text-xl font-bold">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 h-6 w-6 bg-green-500 border-2 border-white rounded-full"></div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{profile?.full_name || 'User'}</h1>
            <p className="text-muted-foreground">Verified Member</p>
          </div>
        </div>

        {/* Personal Information Card */}
        <Card className="gradient-card shadow-card border-0 overflow-hidden transition-spring hover:shadow-button">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="h-10 w-10 gradient-primary rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl transition-smooth hover:bg-white/80">
              <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Phone className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Phone Number</p>
                <p className="text-base font-semibold">{profile?.phone || 'Not provided'}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl transition-smooth hover:bg-white/80">
              <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Building className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Community</p>
                <p className="text-base font-semibold">{profile?.community || 'Not provided'}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl transition-smooth hover:bg-white/80">
              <div className="h-10 w-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Home className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Flat Number</p>
                <p className="text-base font-semibold">{profile?.flat_no || 'Not provided'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions Card */}
        <Card className="gradient-card shadow-card border-0 overflow-hidden transition-spring hover:shadow-button">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="h-10 w-10 gradient-primary rounded-xl flex items-center justify-center">
                <Settings className="w-5 h-5 text-white" />
              </div>
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="ghost" 
              className="w-full justify-start h-12 bg-white/60 hover:bg-white/80 backdrop-blur-sm rounded-2xl transition-smooth"
            >
              <Bell className="w-5 h-5 mr-3 text-orange-600" />
              <span className="flex-1 text-left">Notification Settings</span>
            </Button>

            <Button 
              variant="ghost" 
              className="w-full justify-start h-12 bg-white/60 hover:bg-white/80 backdrop-blur-sm rounded-2xl transition-smooth"
            >
              <Shield className="w-5 h-5 mr-3 text-blue-600" />
              <span className="flex-1 text-left">Privacy & Security</span>
            </Button>
          </CardContent>
        </Card>

        {/* Sign Out Button */}
        <Button 
          onClick={handleSignOut}
          variant="outline"
          className="w-full h-14 rounded-2xl border-2 border-red-200 bg-white/80 hover:bg-red-50 text-red-600 font-semibold transition-spring hover:scale-[0.98] shadow-input"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}