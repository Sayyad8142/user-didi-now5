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
import { useToast } from '@/hooks/use-toast';
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { useCommunities } from '@/hooks/useCommunities';
import { useBuildings } from '@/hooks/useBuildings';
import { useFlats } from '@/hooks/useFlats';
import { isDemoCredentials, setDemoSession } from '@/lib/demo';
import { FlatSearchInput } from './FlatSearchInput';
import { supabase } from '@/integrations/supabase/client';

export function AuthCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { communities, loading: communitiesLoading } = useCommunities();

  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [signInPhone, setSignInPhone] = useState('');
  const [signUpData, setSignUpData] = useState({
    fullName: '',
    phone: '',
    communityId: '',
    communityValue: '',
    buildingId: '',
    flatId: '',
    flatNo: ''
  });

  const selectedCommunity = communities.find(c => c.id === signUpData.communityId);
  const isPHF = selectedCommunity?.flat_format === 'phf_code';
  const { buildings, loading: buildingsLoading } = useBuildings(signUpData.communityId || null);
  const { flats, loading: flatsLoading } = useFlats(signUpData.buildingId || null, signUpData.communityId || null, isPHF);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateSignIn = () => {
    const newErrors: Record<string, string> = {};
    if (!signInPhone) newErrors.phone = 'Mobile number is required';
    else if (!isValidINPhone(signInPhone)) newErrors.phone = 'Please enter a valid 10-digit mobile number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSignUp = () => {
    const newErrors: Record<string, string> = {};
    if (!signUpData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!signUpData.phone) newErrors.phone = 'Mobile number is required';
    else if (!isValidINPhone(signUpData.phone)) newErrors.phone = 'Please enter a valid 10-digit mobile number';
    if (!signUpData.communityId) newErrors.communityId = 'Please select your community';
    const community = communities.find(c => c.id === signUpData.communityId);
    const phf = community?.flat_format === 'phf_code';
    if (!phf && !signUpData.buildingId) newErrors.buildingId = 'Please select your building';
    if (!signUpData.flatId) newErrors.flatId = 'Please select your flat';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendOTP = async () => {
    const isSignUp = activeTab === 'signup';
    const phone = isSignUp ? signUpData.phone : signInPhone;
    if (isSignUp ? !validateSignUp() : !validateSignIn()) return;

    if (isDemoCredentials(phone, '123456') && !isSignUp) {
      setDemoSession();
      toast({ title: 'Demo Login Successful', description: 'You are now logged in as a demo user.' });
      navigate("/home", { replace: true });
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const formattedPhone = formatPhoneIN(phone);
      
      // Use Supabase native phone OTP
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
        options: { shouldCreateUser: true }
      });

      if (error) throw error;

      // Store phone for verify page
      sessionStorage.setItem("otp_phone", formattedPhone);
      sessionStorage.setItem("otp_last_sent", String(Date.now()));

      navigate('/auth/verify', {
        state: { phone: formattedPhone, mode: activeTab, signupData: isSignUp ? signUpData : null, redirectTo: '/home' }
      });
      toast({ title: 'OTP Sent', description: `Verification code sent to ${formattedPhone}` });
    } catch (error: any) {
      console.error('Send OTP error:', error);
      
      let errorMessage = 'Failed to send OTP. Please try again.';
      if (error.message?.includes('rate limit')) {
        errorMessage = 'Too many attempts. Please try again later.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-sm mx-auto shadow-card border-pink-100 gradient-card backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Didi Now</h1>
          <p className="text-muted-foreground text-lg">in 10Mins</p>
        </div>

        <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'signin' | 'signup')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="signin" className="rounded-lg">Sign In</TabsTrigger>
            <TabsTrigger value="signup" className="rounded-lg">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-6">
            <PhoneInputIN value={signInPhone} onChange={setSignInPhone} error={errors.phone} disabled={loading} required />
            <Button onClick={handleSendOTP} disabled={loading || !signInPhone} className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] disabled:scale-100">
              {loading && <CleaningLoader size="sm" className="mr-2" />}
              Send OTP
            </Button>
            <div className="text-center">
              <button type="button" onClick={() => navigate("/admin-login")} className="text-xs text-primary underline hover:no-underline transition-smooth">Admin Login</button>
            </div>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-medium">Name <span className="text-destructive">*</span></Label>
              <Input id="fullName" placeholder="Enter your full name" value={signUpData.fullName} onChange={e => setSignUpData(prev => ({ ...prev, fullName: e.target.value }))} disabled={loading} className="rounded-xl shadow-input" />
              {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
            </div>
            <PhoneInputIN value={signUpData.phone} onChange={value => setSignUpData(prev => ({ ...prev, phone: value }))} error={errors.phone} disabled={loading} required />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Community Name <span className="text-destructive">*</span></Label>
              <Select value={signUpData.communityId} onValueChange={value => { const c = communities.find(x => x.id === value); setSignUpData(prev => ({ ...prev, communityId: value, communityValue: c?.value || '', buildingId: '', flatId: '', flatNo: '' })); }} disabled={loading || communitiesLoading}>
                <SelectTrigger className="rounded-xl shadow-input"><SelectValue placeholder={communitiesLoading ? "Loading..." : "Select community"} /></SelectTrigger>
                <SelectContent>{communities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {errors.communityId && <p className="text-sm text-destructive">{errors.communityId}</p>}
            </div>
            {signUpData.communityId && !isPHF && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Building / Tower <span className="text-destructive">*</span></Label>
                <Select value={signUpData.buildingId} onValueChange={value => setSignUpData(prev => ({ ...prev, buildingId: value, flatId: '', flatNo: '' }))} disabled={loading || buildingsLoading}>
                  <SelectTrigger className="rounded-xl shadow-input"><SelectValue placeholder={buildingsLoading ? "Loading..." : "Select building"} /></SelectTrigger>
                  <SelectContent>{buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                {errors.buildingId && <p className="text-sm text-destructive">{errors.buildingId}</p>}
              </div>
            )}
            {signUpData.communityId && (isPHF || signUpData.buildingId) && (
              <FlatSearchInput flats={flats} value={signUpData.flatNo} onSelect={(flatId, flatNo) => setSignUpData(prev => ({ ...prev, flatId, flatNo }))} disabled={loading} loading={flatsLoading} error={errors.flatId} placeholder="Enter flat number" />
            )}
            <Button onClick={handleSendOTP} disabled={loading} className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] disabled:scale-100">
              {loading && <CleaningLoader size="sm" className="mr-2" />}
              Send OTP
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
