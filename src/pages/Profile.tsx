import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfile } from '@/features/profile/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { User, Phone, Building, Home, LogOut, Settings, Bell, Shield, Edit3, Save, X, HelpCircle, Share2 } from 'lucide-react';
import { openExternalUrl } from '@/lib/nativeOpen';
import { useToast } from '@/hooks/use-toast';
import { AppVersionDisplay } from '@/components/AppVersionDisplay';
import { useCommunities } from '@/hooks/useCommunities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export default function Profile() {
  const { profile, loading } = useProfile();
  const { communities, loading: communitiesLoading } = useCommunities();
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
  if (loading || communitiesLoading) {
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
        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-primary/80 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <User className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white">Personal Information</h2>
              </div>
              
              {!isEditing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="h-10 w-10 p-0 text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Edit3 className="w-5 h-5" />
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    className="h-10 w-10 p-0 text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <Save className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="h-10 w-10 p-0 text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="group">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Full Name</p>
                  {!isEditing ? (
                    <p className="text-lg font-semibold text-gray-900">{profile?.full_name || 'Not provided'}</p>
                  ) : (
                    <Input
                      value={editForm.full_name}
                      onChange={(e) => setEditForm(prev => ({...prev, full_name: e.target.value}))}
                      className="text-lg font-semibold border-0 bg-gray-50 rounded-xl p-3 focus-visible:ring-2 focus-visible:ring-primary/20"
                      placeholder="Enter full name"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="group">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <Phone className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Phone Number</p>
                  {!isEditing ? (
                    <p className="text-lg font-semibold text-gray-900">{profile?.phone || 'Not provided'}</p>
                  ) : (
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm(prev => ({...prev, phone: e.target.value}))}
                      className="text-lg font-semibold border-0 bg-gray-50 rounded-xl p-3 focus-visible:ring-2 focus-visible:ring-primary/20"
                      placeholder="Enter phone number"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="group">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-purple-50 rounded-2xl flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                  <Building className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Community</p>
                  {!isEditing ? (
                    <p className="text-lg font-semibold text-gray-900">
                      {communities.find(c => c.value === profile?.community)?.name || profile?.community || 'Not provided'}
                    </p>
                  ) : (
                    <Select value={editForm.community} onValueChange={(value) => setEditForm(prev => ({ ...prev, community: value }))}>
                      <SelectTrigger className="text-lg font-semibold border-0 bg-gray-50 rounded-xl p-3 focus-visible:ring-2 focus-visible:ring-primary/20 h-auto">
                        <SelectValue placeholder="Select community" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                        {communities.map((community) => (
                          <SelectItem key={community.value} value={community.value}>
                            {community.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>

            <div className="group">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-orange-50 rounded-2xl flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                  <Home className="w-6 h-6 text-orange-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Flat Number</p>
                  {!isEditing ? (
                    <p className="text-lg font-semibold text-gray-900">{profile?.flat_no || 'Not provided'}</p>
                  ) : (
                    <Input
                      value={editForm.flat_no}
                      onChange={(e) => setEditForm(prev => ({...prev, flat_no: e.target.value}))}
                      className="text-lg font-semibold border-0 bg-gray-50 rounded-xl p-3 focus-visible:ring-2 focus-visible:ring-primary/20"
                      placeholder="Enter flat number"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Links */}
        <div className="space-y-3">
          <Link 
            to="/legal/privacy" 
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
            to="/legal/terms" 
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

          <Link 
            to="/profile/account" 
            className="flex items-center justify-between h-14 px-4 bg-white/80 rounded-2xl border border-gray-100 hover:bg-white transition-spring hover:scale-[0.98] shadow-input"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Settings className="w-5 h-5 text-orange-600" />
              </div>
              <span className="font-medium text-gray-700">Account & Data</span>
            </div>
            <div className="text-gray-400">›</div>
          </Link>

          <Link 
            to="/support" 
            className="flex items-center justify-between h-14 px-4 bg-white/80 rounded-2xl border border-gray-100 hover:bg-white transition-spring hover:scale-[0.98] shadow-input"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-green-100 rounded-xl flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-green-600" />
              </div>
              <span className="font-medium text-gray-700">Help & Support</span>
            </div>
            <div className="text-gray-400">›</div>
          </Link>

          <button 
            onClick={() => openExternalUrl('https://didinow.in')}
            className="flex items-center justify-between h-14 px-4 bg-white/80 rounded-2xl border border-gray-100 hover:bg-white transition-spring hover:scale-[0.98] shadow-input w-full"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-pink-100 rounded-xl flex items-center justify-center">
                <Share2 className="w-5 h-5 text-pink-600" />
              </div>
              <span className="font-medium text-gray-700">Refer Us</span>
            </div>
            <div className="text-gray-400">›</div>
          </button>
        </div>

        {/* Sign Out Button */}
        <Button onClick={handleSignOut} variant="outline" className="w-full h-14 rounded-2xl border-2 border-red-200 bg-white/80 hover:bg-red-50 text-red-600 font-semibold transition-spring hover:scale-[0.98] shadow-input">
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>

        {/* App Version */}
        <AppVersionDisplay />
      </div>
    </div>;
}