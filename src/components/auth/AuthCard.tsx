import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhoneInputIN } from './PhoneInputIN';
import { formatPhoneIN, isValidINPhone } from '@/lib/auth-helpers';
import { validateName } from '@/lib/name-validation';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { normalizePhone } from '@/features/profile/ensureProfile';
import { useCommunities } from '@/hooks/useCommunities';
import { useBuildings } from '@/hooks/useBuildings';
import { useFlats } from '@/hooks/useFlats';
import { isDemoCredentials, setDemoSession, setGuestSession, clearDemoSession } from '@/lib/demo';
import { FlatSearchInput } from './FlatSearchInput';
import { sendOtp, setupRecaptcha, signOut as firebaseSignOut, isNativePlatform, isWeb } from '@/lib/firebase';

export function AuthCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { communities, loading: communitiesLoading, error: communitiesError } = useCommunities();

  // Form states
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);

  // Sign In form
  const [signInPhone, setSignInPhone] = useState('');

  // Sign Up form
  const [signUpData, setSignUpData] = useState({
    fullName: '',
    phone: '',
    communityId: '',
    communityValue: '',
    buildingId: '',
    flatId: '',
    flatNo: ''
  });

  // Get selected community details
  const selectedCommunity = communities.find(c => c.id === signUpData.communityId);
  const isPHF = selectedCommunity?.flat_format === 'phf_code';

  // Fetch buildings based on selected community
  const { buildings, loading: buildingsLoading } = useBuildings(signUpData.communityId || null);

  // Fetch flats based on selected building or community (for PHF)
  const { flats, loading: flatsLoading } = useFlats(
    signUpData.buildingId || null,
    signUpData.communityId || null,
    isPHF
  );

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Setup reCAPTCHA on mount — WEB ONLY (never on native Android/iOS)
  useEffect(() => {
    if (!isWeb()) {
      console.log('ℹ️ AuthCard: skipping reCAPTCHA on native platform');
      return;
    }
    const timer = setTimeout(() => {
      console.log('🌐 AuthCard: initializing reCAPTCHA for web');
      setupRecaptcha('recaptcha-container');
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const validateSignIn = () => {
    const newErrors: Record<string, string> = {};
    if (!signInPhone) {
      newErrors.phone = 'Mobile number is required';
    } else if (!isValidINPhone(signInPhone)) {
      newErrors.phone = 'Please enter a valid 10-digit mobile number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSignUp = () => {
    const newErrors: Record<string, string> = {};
    const nameErr = validateName(signUpData.fullName);
    if (nameErr) {
      newErrors.fullName = nameErr;
    }
    if (!signUpData.phone) {
      newErrors.phone = 'Mobile number is required';
    } else if (!isValidINPhone(signUpData.phone)) {
      newErrors.phone = 'Please enter a valid 10-digit mobile number';
    }
    if (!signUpData.communityId) {
      newErrors.communityId = 'Please select your community';
    }
    
    const selectedCommunity = communities.find(c => c.id === signUpData.communityId);
    const isPHF = selectedCommunity?.flat_format === 'phf_code';
    
    if (!isPHF && !signUpData.buildingId) {
      newErrors.buildingId = 'Please select your building';
    }
    if (!signUpData.flatId) {
      newErrors.flatId = 'Please select a valid flat from the list';
    } else {
      const flatExists = flats.some(f => f.id === signUpData.flatId);
      if (!flatExists) {
        newErrors.flatId = 'Please select a valid flat from the list';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkIfUserExists = async (phone: string): Promise<boolean> => {
    try {
      const normalizedPhone = normalizePhone(phone);
      const formattedPhone = formatPhoneIN(phone);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone')
        .in('phone', [normalizedPhone, formattedPhone])
        .maybeSingle();

      if (error) {
        console.error('Error checking user existence:', error);
        return false;
      }
      return !!data;
    } catch (error) {
      console.error('Error checking user existence:', error);
      return false;
    }
  };

  const handleSendOTP = async () => {
    const isSignUp = activeTab === 'signup';
    const phone = isSignUp ? signUpData.phone : signInPhone;

    if (isSignUp ? !validateSignUp() : !validateSignIn()) {
      return;
    }

    // Check for demo credentials first
    if (isDemoCredentials(phone, '123456') && !isSignUp) {
      console.log('Demo login detected');
      setDemoSession();
      toast({
        title: 'Demo Login Successful',
        description: 'You are now logged in as a demo user.'
      });
      navigate("/home", { replace: true });
      return;
    }

    setLoading(true);
    setErrors({});

    // If user previously used Guest/Demo mode, clear it as soon as they start real login
    clearDemoSession();

    try {
      const formattedPhone = formatPhoneIN(phone);

      // For sign in, check if user exists first
      if (!isSignUp) {
        const userExists = await checkIfUserExists(phone);
        if (!userExists) {
          setErrors({ phone: 'Mobile number not registered, sign up first.' });
          setLoading(false);
          return;
        }
      }

      // Send OTP via Firebase
      const result = await sendOtp(formattedPhone);
      
      if (!result.success) {
        setErrors({ phone: result.error || 'Failed to send OTP' });
        setLoading(false);
        return;
      }

      // Navigate to verification with state
      navigate('/auth/verify', {
        state: {
          phone: formattedPhone,
          mode: activeTab,
          signupData: isSignUp ? signUpData : null,
          redirectTo: '/home'
        }
      });

      toast({
        title: 'OTP Sent',
        description: `Verification code sent to ${formattedPhone}`
      });
    } catch (error: any) {
      console.error('Send OTP error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send OTP. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsGuest = async () => {
    try {
      // Sign out from Firebase first to ensure guest mode takes precedence
      await firebaseSignOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
    
    // Set guest session - this will trigger demo-mode-changed event
    setGuestSession();
    
    toast({
      title: 'Welcome Guest!',
      description: 'You can browse and explore our services.'
    });
    
    // Small delay to ensure AuthProvider processes the event
    setTimeout(() => {
      navigate("/home", { replace: true });
    }, 100);
  };

  return (
    <Card className="w-full shadow-2xl border-0 bg-white/80 backdrop-blur-xl rounded-3xl overflow-hidden">
      {/* Decorative top gradient bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-pink-400 via-rose-500 to-fuchsia-500" />
      
      <CardContent className="p-8">
        {/* Brand Header with enhanced styling */}
        <div className="text-center mb-10">
          <div className="relative inline-block">
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 bg-clip-text text-transparent tracking-tight">
              Didi Now
            </h1>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-16 h-1 bg-gradient-to-r from-pink-400 to-rose-500 rounded-full" />
          </div>
          <p className="text-muted-foreground text-lg mt-4 font-medium">in 10Mins</p>
        </div>

        <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'signin' | 'signup')}>
          <TabsList className="grid w-full grid-cols-2 mb-8 p-1.5 bg-pink-50/80 rounded-2xl h-14">
            <TabsTrigger 
              value="signin" 
              className="rounded-xl text-base font-semibold data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-pink-600 transition-all duration-300"
            >
              Sign In
            </TabsTrigger>
            <TabsTrigger 
              value="signup" 
              className="rounded-xl text-base font-semibold data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-pink-600 transition-all duration-300"
            >
              Sign Up
            </TabsTrigger>
          </TabsList>

          {/* Sign In Tab */}
          <TabsContent value="signin" className="space-y-6">
            <PhoneInputIN value={signInPhone} onChange={setSignInPhone} error={errors.phone} disabled={loading} required />

            <Button 
              onClick={handleSendOTP} 
              disabled={loading || !signInPhone} 
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white font-semibold text-lg shadow-xl shadow-pink-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-pink-500/40 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
            >
              {loading && <CleaningLoader size="sm" className="mr-2" />}
              Send OTP
            </Button>
          </TabsContent>

          {/* Sign Up Tab */}
          <TabsContent value="signup" className="space-y-4">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input 
                id="fullName" 
                type="text" 
                placeholder="Enter your full name" 
                value={signUpData.fullName} 
                onChange={e => setSignUpData(prev => ({ ...prev, fullName: e.target.value }))} 
                disabled={loading} 
                className="rounded-xl shadow-input transition-smooth focus:ring-2 focus:ring-primary/20" 
              />
              {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
            </div>

            {/* Phone Input */}
            <PhoneInputIN 
              value={signUpData.phone} 
              onChange={value => setSignUpData(prev => ({ ...prev, phone: value }))} 
              error={errors.phone} 
              disabled={loading} 
              required 
            />

            {/* Community */}
            <div className="space-y-2">
              <Label htmlFor="community" className="text-sm font-medium">
                Community Name <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={signUpData.communityId} 
                onValueChange={value => {
                  const community = communities.find(c => c.id === value);
                  setSignUpData(prev => ({
                    ...prev,
                    communityId: value,
                    communityValue: community?.value || '',
                    buildingId: '',
                    flatId: '',
                    flatNo: ''
                  }));
                }} 
                disabled={loading || communitiesLoading}
              >
                <SelectTrigger className="rounded-xl shadow-input transition-smooth focus:ring-2 focus:ring-primary/20">
                  <SelectValue placeholder={communitiesLoading ? "Loading communities..." : communitiesError ? "Error loading communities" : "Select your community"} />
                </SelectTrigger>
                <SelectContent>
                  {communities.map(community => (
                    <SelectItem key={community.id} value={community.id}>
                      {community.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.communityId && <p className="text-sm text-destructive">{errors.communityId}</p>}
              {communitiesError && <p className="text-sm text-destructive">Failed to load communities. Please try again.</p>}
            </div>

            {/* Building - Only show if not PHF format */}
            {signUpData.communityId && !isPHF && (
              <div className="space-y-2">
                <Label htmlFor="building" className="text-sm font-medium">
                  Building / Tower <span className="text-destructive">*</span>
                </Label>
                <Select 
                  value={signUpData.buildingId} 
                  onValueChange={value => setSignUpData(prev => ({
                    ...prev,
                    buildingId: value,
                    flatId: '',
                    flatNo: ''
                  }))} 
                  disabled={loading || buildingsLoading || !signUpData.communityId}
                >
                  <SelectTrigger className="rounded-xl shadow-input transition-smooth focus:ring-2 focus:ring-primary/20">
                    <SelectValue placeholder={buildingsLoading ? "Loading buildings..." : "Select your building"} />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map(building => (
                      <SelectItem key={building.id} value={building.id}>
                        {building.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.buildingId && <p className="text-sm text-destructive">{errors.buildingId}</p>}
              </div>
            )}

            {/* Flat Number - Searchable Input */}
            {signUpData.communityId && (isPHF || signUpData.buildingId) && (
              <FlatSearchInput
                flats={flats}
                value={signUpData.flatNo}
                onSelect={(flatId, flatNo) => {
                  setSignUpData(prev => ({
                    ...prev,
                    flatId,
                    flatNo
                  }));
                }}
                disabled={loading || (isPHF ? !signUpData.communityId : !signUpData.buildingId)}
                loading={flatsLoading}
                error={errors.flatId}
                placeholder="Enter your flat number"
              />
            )}

            <Button 
              onClick={handleSendOTP} 
              disabled={loading} 
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 text-white font-semibold text-lg shadow-xl shadow-pink-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-pink-500/40 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
            >
              {loading && <CleaningLoader size="sm" className="mr-2" />}
              Send OTP
            </Button>
          </TabsContent>
        </Tabs>

        {/* Guest Login Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-muted-foreground font-medium">Or</span>
          </div>
        </div>

        {/* Continue as Guest Button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleContinueAsGuest}
          className="w-full h-12 rounded-2xl border-2 border-pink-200 text-pink-600 font-semibold hover:bg-pink-50 hover:border-pink-300 transition-all duration-300"
        >
          Continue as Guest
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-2">
          Explore services before signing up
        </p>

        {/* Invisible reCAPTCHA container — WEB ONLY */}
        {isWeb() && <div id="recaptcha-container"></div>}
      </CardContent>
    </Card>
  );
}
