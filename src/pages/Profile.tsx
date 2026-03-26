import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfile } from '@/contexts/ProfileContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { User, Phone, Building, Home, LogOut, Settings, Shield, Edit3, Save, X, HelpCircle, Share2, Building2, Ruler, Wallet } from 'lucide-react';
import { openExternalUrl } from '@/lib/nativeOpen';
import { useToast } from '@/hooks/use-toast';
import { validateName } from '@/lib/name-validation';
import { AppVersionDisplay } from '@/components/AppVersionDisplay';
import { useCommunities } from '@/hooks/useCommunities';
import { useBuildings } from '@/hooks/useBuildings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFlats } from '@/hooks/useFlats';
import { useFlatSize } from '@/hooks/useFlatSize';
import { useWalletBalance } from '@/hooks/useWallet';

function WalletCard() {
  const navigate = useNavigate();
  const { data: wallet, isLoading } = useWalletBalance();
  const balance = wallet?.balance_inr ?? 0;

  return (
    <button
      onClick={() => navigate('/wallet')}
      className="flex items-center justify-between w-full p-4 bg-gradient-to-r from-[#ff007a]/10 to-[#e6006a]/5 rounded-2xl border border-[#ff007a]/20 hover:border-[#ff007a]/40 transition-all hover:scale-[0.99] shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 bg-gradient-to-br from-[#ff007a] to-[#e6006a] rounded-xl flex items-center justify-center shadow-sm">
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div className="text-left">
          <p className="font-semibold text-gray-900 text-sm">Didi Now Wallet</p>
          {isLoading ? (
            <Skeleton className="h-4 w-16 mt-0.5" />
          ) : (
            <p className="text-xs text-gray-600">Balance: <span className="font-bold text-[#ff007a]">₹{balance}</span></p>
          )}
        </div>
      </div>
      <div className="text-gray-400 text-lg">›</div>
    </button>
  );
}

export default function Profile() {
  const { profile, loading, refresh } = useProfile();
  const { communities, loading: communitiesLoading } = useCommunities();
  const { flatSize, loading: flatSizeLoading } = useFlatSize();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    community: '',
    community_id: '',
    building_id: '',
    flat_id: '',
    flat_no: ''
  });

  // Get the selected community to check format
  const selectedCommunity = communities.find(c => c.id === editForm.community_id);
  const isPHF = selectedCommunity?.flat_format === 'PHF';

  // Use hooks with edit form values for dynamic dropdowns
  const { buildings } = useBuildings(editForm.community_id || null);
  const { flats } = useFlats(editForm.building_id || null, editForm.community_id || null, isPHF);

  // Refresh profile on mount if profile data is incomplete (handles new signup race condition)
  React.useEffect(() => {
    if (!loading && profile && !profile.full_name) {
      refresh();
    }
  }, [loading, profile?.full_name]);

  // Initialize form when profile loads
  React.useEffect(() => {
    if (profile) {
      setEditForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        community: profile.community || '',
        community_id: profile.community_id || '',
        building_id: profile.building_id || '',
        flat_id: profile.flat_id || '',
        flat_no: profile.flat_no || ''
      });
    }
  }, [profile]);

  const handleSave = async () => {
    const nameErr = validateName(editForm.full_name);
    if (nameErr) {
      toast({ title: 'Invalid Name', description: nameErr, variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          phone: editForm.phone,
          community: editForm.community,
          community_id: editForm.community_id || null,
          building_id: editForm.building_id || null,
          flat_id: editForm.flat_id || null,
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
        community_id: profile.community_id || '',
        building_id: profile.building_id || '',
        flat_id: profile.flat_id || '',
        flat_no: profile.flat_no || ''
      });
    }
    setIsEditing(false);
  };
  const handleSignOut = async () => {
    try {
      const { signOut: firebaseSignOut } = await import('@/lib/firebase');
      const { clearDemoSession } = await import('@/lib/demo');
      const { unregisterFcmToken } = await import('@/hooks/usePushNotifications');
      
      // 1. Unregister FCM token from backend BEFORE signing out
      console.log('[Logout] Unregistering FCM token...');
      await unregisterFcmToken();
      
      // 2. Clear demo/guest state
      clearDemoSession();
      
      // 3. Sign out from Firebase (primary auth)
      await firebaseSignOut();
      
      // 4. Sign out from Supabase (secondary, just in case)
      await supabase.auth.signOut();
      
      toast({
        title: 'Signed out successfully',
        description: 'You have been logged out of your account'
      });
      
      // Force full page reload to clear all state
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: 'Error',
        description: 'Failed to sign out',
        variant: 'destructive'
      });
      // Still redirect even on error
      window.location.href = '/auth';
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
  return <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="pt-safe bg-slate-50 sticky top-0 z-50">
        <div className="max-w-md mx-auto px-4 py-2">
          <h1 className="text-2xl font-bold text-primary text-center">Profile</h1>
        </div>
      </header>
      <section className="flex-1 gradient-bg pb-24">
        <div className="max-w-md mx-auto px-4 py-8 space-y-6 bg-slate-50">
        {/* Didi Now Wallet */}
        <WalletCard />

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
                  className="h-9 px-3 text-white/90 hover:text-white hover:bg-white/20 rounded-full font-medium text-sm gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    className="h-9 px-4 bg-white text-primary hover:bg-white/90 rounded-full font-semibold text-sm gap-1.5 shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="h-9 px-3 text-white/90 hover:text-white hover:bg-white/20 rounded-full font-medium text-sm"
                  >
                    Cancel
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
                    <Select 
                      value={editForm.community_id} 
                      onValueChange={(value) => {
                        const comm = communities.find(c => c.id === value);
                        setEditForm(prev => ({ 
                          ...prev, 
                          community_id: value,
                          community: comm?.value || '',
                          building_id: '', // reset building when community changes
                          flat_id: '',
                          flat_no: ''
                        }));
                      }}
                    >
                      <SelectTrigger className="text-lg font-semibold border-0 bg-gray-50 rounded-xl p-3 focus-visible:ring-2 focus-visible:ring-primary/20 h-auto">
                        <SelectValue placeholder="Select community" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                        {communities.map((community) => (
                          <SelectItem key={community.id} value={community.id}>
                            {community.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>

            {/* Building - show if buildings exist for community (not PHF format) */}
            {!isPHF && buildings.length > 0 && (
              <div className="group">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                    <Building2 className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Building</p>
                    {!isEditing ? (
                      <p className="text-lg font-semibold text-gray-900">
                        {buildings.find(b => b.id === profile?.building_id)?.name || 'Not provided'}
                      </p>
                    ) : (
                      <Select 
                        value={editForm.building_id} 
                        onValueChange={(value) => {
                          setEditForm(prev => ({ 
                            ...prev, 
                            building_id: value,
                            flat_id: '', // reset flat when building changes
                            flat_no: ''
                          }));
                        }}
                      >
                        <SelectTrigger className="text-lg font-semibold border-0 bg-gray-50 rounded-xl p-3 focus-visible:ring-2 focus-visible:ring-primary/20 h-auto">
                          <SelectValue placeholder="Select building" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                          {buildings.map((building) => (
                            <SelectItem key={building.id} value={building.id}>
                              {building.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Flat Number */}
            <div className="group">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-orange-50 rounded-2xl flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                  <Home className="w-6 h-6 text-orange-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Flat Number</p>
                  {!isEditing ? (
                    <p className="text-lg font-semibold text-gray-900">{profile?.flat_no || 'Not provided'}</p>
                  ) : flats.length > 0 ? (
                    <Select 
                      value={editForm.flat_id} 
                      onValueChange={(value) => {
                        const flat = flats.find(f => f.id === value);
                        setEditForm(prev => ({ 
                          ...prev, 
                          flat_id: value,
                          flat_no: flat?.flat_no || ''
                        }));
                      }}
                    >
                      <SelectTrigger className="text-lg font-semibold border-0 bg-gray-50 rounded-xl p-3 focus-visible:ring-2 focus-visible:ring-primary/20 h-auto">
                        <SelectValue placeholder="Select flat number" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60">
                        {flats.map((flat) => (
                          <SelectItem key={flat.id} value={flat.id}>
                            {flat.flat_no}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            {/* Flat Size (read-only from flats table) */}
            <div className="group">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-pink-50 rounded-2xl flex items-center justify-center group-hover:bg-pink-100 transition-colors">
                  <Ruler className="w-6 h-6 text-pink-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Flat Size</p>
                  {flatSizeLoading ? (
                    <Skeleton className="h-6 w-20 rounded" />
                  ) : flatSize ? (
                    <p className="text-lg font-semibold text-gray-900">{flatSize}</p>
                  ) : (
                    <p className="text-sm text-gray-400">Not available — contact support</p>
                  )}
                </div>
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
            onClick={() => openExternalUrl('https://web.didisnow.com')}
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
      </section>
    </main>;
}