import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhoneInputIN } from './PhoneInputIN';
import { formatPhoneIN, isValidINPhone } from '@/lib/auth-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Smartphone, UserCheck } from 'lucide-react';
import { normalizePhone } from '@/features/profile/ensureProfile';
import { useCommunities } from '@/hooks/useCommunities';

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
    community: '',
    flatNo: '',
  });
  
  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    
    if (!signUpData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }
    
    if (!signUpData.phone) {
      newErrors.phone = 'Mobile number is required';
    } else if (!isValidINPhone(signUpData.phone)) {
      newErrors.phone = 'Please enter a valid 10-digit mobile number';
    }
    
    if (!signUpData.community) {
      newErrors.community = 'Please select your community';
    }
    
    if (!signUpData.flatNo.trim()) {
      newErrors.flatNo = 'Flat number is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkIfUserExists = async (phone: string): Promise<boolean> => {
    try {
      // Use the same normalization function used during profile creation
      const normalizedPhone = normalizePhone(phone);
      const formattedPhone = formatPhoneIN(phone);
      
      console.log('Checking user existence for:', { phone, normalizedPhone, formattedPhone });
      
      // Check if user exists in profiles table with either format
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone')
        .in('phone', [normalizedPhone, formattedPhone])
        .maybeSingle();

      if (error) {
        console.error('Error checking user existence:', error);
        return false;
      }

      console.log('User existence check result:', data);
      return !!data;
    } catch (error) {
      console.error('Error checking user existence:', error);
      return false;
    }
  };

  const handleDemoLogin = async () => {
    if (!import.meta.env.VITE_DEMO_ENABLED || import.meta.env.VITE_DEMO_ENABLED !== 'true') {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // Check if demo phone/OTP match
      if (signInPhone === import.meta.env.VITE_DEMO_PHONE) {
        // Instead of OTP, sign in with demo email/password
        const { error } = await supabase.auth.signInWithPassword({
          email: import.meta.env.VITE_DEMO_EMAIL,
          password: import.meta.env.VITE_DEMO_PASSWORD,
        });

        if (error) throw error;

        toast({
          title: 'Demo Login Successful',
          description: 'Welcome to the demo!',
        });

        navigate('/home');
      } else {
        toast({
          title: 'Invalid Demo Credentials',
          description: 'Use phone 987654321 for demo login',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Demo login error:', error);
      toast({
        title: 'Demo Login Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = () => {
    localStorage.setItem('guestSession', 'true');
    toast({
      title: 'Browsing as Guest',
      description: 'You can view services but sign in to book',
    });
    navigate('/home');
  };

  const handleFillDemo = () => {
    if (import.meta.env.VITE_DEMO_ENABLED === 'true') {
      setSignInPhone(import.meta.env.VITE_DEMO_PHONE);
    }
  };

  const handleSendOTP = async () => {
    const isSignUp = activeTab === 'signup';
    const phone = isSignUp ? signUpData.phone : signInPhone;
    
    if (isSignUp ? !validateSignUp() : !validateSignIn()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const formattedPhone = formatPhoneIN(phone);
      
      // For sign-in, skip existence check due to RLS; let OTP proceed for both cases
      // This avoids false "no account" errors for existing users.
      // If the phone is new, Supabase will handle account creation upon verification.

      
      // For sign-up, check if user already exists
      if (isSignUp) {
        const userExists = await checkIfUserExists(phone);
        if (userExists) {
          setErrors({ phone: "An account with this mobile number already exists. Please sign in instead." });
          setLoading(false);
          return;
        }
      }
      
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
        options: {
          channel: 'sms',
        },
      });

      if (error) throw error;

      // Navigate to verification with state
      navigate('/auth/verify', {
        state: {
          phone: formattedPhone,
          mode: activeTab,
          signupData: isSignUp ? signUpData : null,
          redirectTo: "/home",
        },
      });

      toast({
        title: 'OTP Sent',
        description: `Verification code sent to ${formattedPhone}`,
      });
    } catch (error: any) {
      console.error('Send OTP error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send OTP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-sm mx-auto shadow-card border-pink-100 gradient-card backdrop-blur-sm">
      <CardContent className="p-6">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Didi Now</h1>
          <p className="text-muted-foreground text-lg">in 10Mins</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'signin' | 'signup')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="signin" className="rounded-lg">Sign In</TabsTrigger>
            <TabsTrigger value="signup" className="rounded-lg">Sign Up</TabsTrigger>
          </TabsList>

          {/* Sign In Tab */}
          <TabsContent value="signin" className="space-y-6">
            <PhoneInputIN
              value={signInPhone}
              onChange={setSignInPhone}
              error={errors.phone}
              disabled={loading}
              required
            />

            <Button
              onClick={handleSendOTP}
              disabled={loading || !signInPhone}
              className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] disabled:scale-100"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send OTP
            </Button>

            {/* Demo and Guest Login Options */}
            {import.meta.env.VITE_DEMO_ENABLED === 'true' && (
              <div className="space-y-3">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Quick Options
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleFillDemo}
                  variant="outline"
                  className="w-full h-10 text-sm"
                  disabled={loading}
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  Fill Demo Phone & OTP
                </Button>

                <Button
                  onClick={handleDemoLogin}
                  variant="outline"
                  className="w-full h-10 text-sm border-orange-200 text-orange-700 hover:bg-orange-50"
                  disabled={loading}
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Use Demo Login
                  <span className="ml-auto text-xs opacity-75">Phone 987654321 • OTP 123456</span>
                </Button>
              </div>
            )}

            <Button
              onClick={handleGuestLogin}
              variant="ghost"
              className="w-full h-10 text-sm text-muted-foreground hover:text-foreground"
              disabled={loading}
            >
              Continue as Guest
            </Button>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/admin-login")}
                className="text-xs text-primary underline hover:no-underline transition-smooth"
              >
                Admin Login
              </button>
            </div>
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
                onChange={(e) => setSignUpData(prev => ({ ...prev, fullName: e.target.value }))}
                disabled={loading}
                className="rounded-xl shadow-input transition-smooth focus:ring-2 focus:ring-primary/20"
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName}</p>
              )}
            </div>

            {/* Phone Input */}
            <PhoneInputIN
              value={signUpData.phone}
              onChange={(value) => setSignUpData(prev => ({ ...prev, phone: value }))}
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
                value={signUpData.community}
                onValueChange={(value) => setSignUpData(prev => ({ ...prev, community: value }))}
                disabled={loading || communitiesLoading}
              >
                <SelectTrigger className="rounded-xl shadow-input transition-smooth focus:ring-2 focus:ring-primary/20">
                  <SelectValue 
                    placeholder={
                      communitiesLoading 
                        ? "Loading communities..." 
                        : communitiesError 
                        ? "Error loading communities" 
                        : "Select your community"
                    } 
                  />
                </SelectTrigger>
                <SelectContent>
                  {communities.map((community) => (
                    <SelectItem key={community.id} value={community.value}>
                      {community.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.community && (
                <p className="text-sm text-destructive">{errors.community}</p>
              )}
              {communitiesError && (
                <p className="text-sm text-destructive">Failed to load communities. Please try again.</p>
              )}
            </div>

            {/* Flat Number */}
            <div className="space-y-2">
              <Label htmlFor="flatNo" className="text-sm font-medium">
                Flat No <span className="text-destructive">*</span>
              </Label>
              <Input
                id="flatNo"
                type="text"
                placeholder="e.g., A-401, Tower 2"
                value={signUpData.flatNo}
                onChange={(e) => setSignUpData(prev => ({ ...prev, flatNo: e.target.value }))}
                disabled={loading}
                className="rounded-xl shadow-input transition-smooth focus:ring-2 focus:ring-primary/20"
              />
              {errors.flatNo && (
                <p className="text-sm text-destructive">{errors.flatNo}</p>
              )}
            </div>

            <Button
              onClick={handleSendOTP}
              disabled={loading}
              className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] disabled:scale-100"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send OTP
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}