import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfile } from '@/features/profile/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { User, Phone, Building, Home, LogOut, Settings, Bell, Shield, Edit3, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
export default function Profile() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    community: '',
    flat_no: ''
  });

  // Initialize form when profile loads
  React.useEffect(() => {
    if (profile) {
      setEditForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        community: profile.community || '',
        flat_no: profile.flat_no || ''
      });
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          phone: editForm.phone,
          community: editForm.community,
          flat_no: editForm.flat_no,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile?.id);

      if (error) throw error;

      setIsEditing(false);
      toast({
        title: 'Profile updated',
        description: 'Your profile information has been updated successfully'
      });
      
      // Refresh the page to show updated data
      window.location.reload();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive'
      });
    }
  };

  const handleCancel = () => {
    if (profile) {
      setEditForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        community: profile.community || '',
        flat_no: profile.flat_no || ''
      });
    }
    setIsEditing(false);
  };
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
      toast({
        title: 'Signed out successfully',
        description: 'You have been logged out of your account'
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: 'Error',
        description: 'Failed to sign out',
        variant: 'destructive'
      });
    }
  };
  if (loading) {
    return <div className="min-h-screen gradient-bg pb-24">
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
      </div>;
  }

  // Get user initials for avatar fallback
  const getInitials = (name: string = '') => {
    return name.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2);
  };
  return <div className="min-h-screen gradient-bg pb-24">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6 bg-slate-50">
        {/* Header Section with Avatar */}
        

        {/* Personal Information Card */}
        <Card className="gradient-card shadow-card border-0 overflow-hidden transition-spring hover:shadow-button">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="h-10 w-10 gradient-primary rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                Personal Information
              </CardTitle>
              
              {!isEditing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                >
                  <Edit3 className="w-4 h-4" />
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl transition-smooth hover:bg-white/80">
              <div className="h-10 w-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                {!isEditing ? (
                  <p className="text-base font-semibold">{profile?.full_name || 'Not provided'}</p>
                ) : (
                  <Input
                    value={editForm.full_name}
                    onChange={(e) => setEditForm(prev => ({...prev, full_name: e.target.value}))}
                    className="mt-1 border-0 bg-transparent p-0 text-base font-semibold focus-visible:ring-0"
                    placeholder="Enter full name"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl transition-smooth hover:bg-white/80">
              <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Phone className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Phone Number</p>
                {!isEditing ? (
                  <p className="text-base font-semibold">{profile?.phone || 'Not provided'}</p>
                ) : (
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm(prev => ({...prev, phone: e.target.value}))}
                    className="mt-1 border-0 bg-transparent p-0 text-base font-semibold focus-visible:ring-0"
                    placeholder="Enter phone number"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl transition-smooth hover:bg-white/80">
              <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Building className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Community</p>
                {!isEditing ? (
                  <p className="text-base font-semibold">{profile?.community || 'Not provided'}</p>
                ) : (
                  <Input
                    value={editForm.community}
                    onChange={(e) => setEditForm(prev => ({...prev, community: e.target.value}))}
                    className="mt-1 border-0 bg-transparent p-0 text-base font-semibold focus-visible:ring-0"
                    placeholder="Enter community"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl transition-smooth hover:bg-white/80">
              <div className="h-10 w-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Home className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Flat Number</p>
                {!isEditing ? (
                  <p className="text-base font-semibold">{profile?.flat_no || 'Not provided'}</p>
                ) : (
                  <Input
                    value={editForm.flat_no}
                    onChange={(e) => setEditForm(prev => ({...prev, flat_no: e.target.value}))}
                    className="mt-1 border-0 bg-transparent p-0 text-base font-semibold focus-visible:ring-0"
                    placeholder="Enter flat number"
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legal Links */}
        <div className="space-y-3">
          <Link 
            to="/legal?tab=privacy" 
            className="flex items-center justify-between h-14 px-4 bg-white/80 rounded-2xl border border-gray-100 hover:bg-white transition-spring hover:scale-[0.98] shadow-input"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <span className="font-medium text-gray-700">Privacy Policy</span>
            </div>
            <div className="text-gray-400">›</div>
          </Link>
          
          <Link 
            to="/legal?tab=terms" 
            className="flex items-center justify-between h-14 px-4 bg-white/80 rounded-2xl border border-gray-100 hover:bg-white transition-spring hover:scale-[0.98] shadow-input"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Settings className="w-5 h-5 text-purple-600" />
              </div>
              <span className="font-medium text-gray-700">Terms of Service</span>
            </div>
            <div className="text-gray-400">›</div>
          </Link>
        </div>

        {/* Sign Out Button */}
        <Button onClick={handleSignOut} variant="outline" className="w-full h-14 rounded-2xl border-2 border-red-200 bg-white/80 hover:bg-red-50 text-red-600 font-semibold transition-spring hover:scale-[0.98] shadow-input">
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>;
}