import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OtpBoxes } from '@/components/auth/OtpBoxes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { maskPhone } from '@/lib/auth-helpers';
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { normalizePhone } from '@/features/profile/ensureProfile';
import { isDemoCredentials, setDemoSession } from '@/lib/demo';
import { useProfile } from '@/contexts/ProfileContext';
import { verifyOtp, sendOtp, getCurrentUser, setupRecaptcha } from '@/lib/firebase';

interface LocationState {
  phone: string;
  mode: 'signin' | 'signup';
  signupData?: {
    fullName: string;
    phone: string;
    communityId: string;
    communityValue: string;
    buildingId: string;
    flatId: string;
    flatNo: string;
  } | null;
  adminLogin?: boolean;
  redirectTo?: string;
}

function isAdminPhone(phone?: string | null) {
  const env = import.meta.env.VITE_ADMIN_PHONES ?? "";
  const target = normalizePhone(phone ?? "");
  if (!target) return false;
  return env
    .split(",")
    .map(s => normalizePhone(s.trim()))
    .filter(Boolean)
    .includes(target);
}

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { refresh: refreshProfile } = useProfile();
  
  const state = location.state as LocationState;
  
  const phone = state?.phone || "";
  const adminIntent = state?.adminLogin || false;
  const redirectTo = state?.redirectTo || (adminIntent ? "/admin" : "/home");
  
  // Redirect if no state
  useEffect(() => {
    if (!phone) {
      navigate('/auth');
    }
  }, [phone, navigate]);

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [error, setError] = useState('');

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Ensure profile exists after Firebase auth
  const ensureFirebaseProfile = async (firebaseUid: string, phoneNumber: string) => {
    const normalized = normalizePhone(phoneNumber);

    try {
      // 1) Prefer lookup by firebase_uid
      const { data: byUid, error: byUidErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('firebase_uid', firebaseUid)
        .maybeSingle();

      if (byUidErr && byUidErr.code !== 'PGRST116') {
        console.error('Error fetching profile by firebase_uid:', byUidErr);
        throw byUidErr;
      }

      if (byUid) {
        console.log('✅ Profile exists (firebase_uid):', byUid.id);
        return byUid;
      }

      // 2) Fallback: lookup by phone (handles older rows where firebase_uid was empty)
      const phoneCandidates = Array.from(
        new Set([normalized, phoneNumber].map(s => (s ?? '').trim()).filter(Boolean))
      );

      let byPhone: any = null;
      if (phoneCandidates.length > 0) {
        const orExpr = phoneCandidates.map(p => `phone.eq.${p}`).join(',');
        const { data, error: byPhoneErr } = await supabase
          .from('profiles')
          .select('*')
          .or(orExpr)
          .maybeSingle();

        if (byPhoneErr && byPhoneErr.code !== 'PGRST116') {
          console.error('Error fetching profile by phone:', byPhoneErr);
          throw byPhoneErr;
        }

        byPhone = data ?? null;
      }

      if (byPhone) {
        // Phone is already registered: attach firebase_uid (or error if linked elsewhere)
        if (byPhone.firebase_uid && byPhone.firebase_uid !== firebaseUid) {
          throw new Error('This phone number is already linked to another account.');
        }

        const { data: updated, error: updateErr } = await supabase
          .from('profiles')
          .update({ firebase_uid: firebaseUid, phone: normalized || byPhone.phone })
          .eq('id', byPhone.id)
          .select()
          .single();

        if (updateErr) {
          console.error('Error updating existing profile with firebase_uid:', updateErr);
          throw updateErr;
        }

        console.log('✅ Profile linked to Firebase UID:', updated.id);
        return updated;
      }

      // 3) Create new profile
      console.log('📝 Creating new profile for Firebase user:', firebaseUid);
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          firebase_uid: firebaseUid,
          phone: normalized,
          full_name: state?.signupData?.fullName || 'User',
          community: state?.signupData?.communityValue || 'default',
          flat_no: state?.signupData?.flatNo || 'N/A',
          community_id: state?.signupData?.communityId || null,
          building_id: state?.signupData?.buildingId || null,
          flat_id: state?.signupData?.flatId || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating profile:', insertError);
        throw insertError;
      }

      console.log('✅ Profile created:', newProfile.id);
      return newProfile;
    } catch (error) {
      console.error('Error in ensureFirebaseProfile:', error);
      throw error;
    }
  };

  const handleVerifyOTP = async () => {
    if (!phone) {
      setError("Session expired. Please resend OTP.");
      return;
    }
    if (otp.trim().length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Check for demo credentials
      if (isDemoCredentials(phone, otp)) {
        console.log('Demo login detected');
        setDemoSession();
        
        toast({
          title: 'Demo Login Successful',
          description: 'You are now logged in as a demo user.',
        });
        
        navigate(redirectTo || "/home", { replace: true });
        return;
      }

      // Verify OTP via Firebase
      const result = await verifyOtp(otp.trim());

      if (!result.success) {
        setError(result.error || 'Invalid OTP');
        setLoading(false);
        return;
      }

      console.log('✅ Firebase auth successful:', result.user?.uid);

      // Ensure profile exists in Supabase
      const profile = await ensureFirebaseProfile(result.user!.uid, phone);

      // If signup mode with additional data, update the profile
      if (state?.mode === 'signup' && state.signupData && profile) {
        console.log('📝 Updating profile with signup data');

        if (!state.signupData.communityValue) {
          toast({
            title: 'Signup Error',
            description: 'Community information is missing. Please try signing up again.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        if (!state.signupData.flatId || !state.signupData.flatNo) {
          toast({
            title: 'Signup Error',
            description: 'Flat information is missing. Please try signing up again.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: state.signupData.fullName,
            community: state.signupData.communityValue,
            flat_no: state.signupData.flatNo,
            community_id: state.signupData.communityId,
            building_id: state.signupData.buildingId || null,
            flat_id: state.signupData.flatId,
          })
          .eq('id', profile.id);

        if (updateError) {
          console.error('❌ Profile update error:', updateError);
          toast({
            title: 'Signup Failed',
            description: `Failed to complete profile setup: ${updateError.message}`,
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        console.log('✅ Profile updated successfully');
        
        await refreshProfile();
        
        toast({
          title: 'Welcome to Didi Now!',
          description: 'Your account has been created successfully.',
        });
      } else {
        toast({
          title: 'Login Successful',
          description: 'Welcome back!',
        });
      }

      // Set portal based on where user is going
      const { PortalStore } = await import('@/lib/portal');
      
      if (redirectTo) {
        if (redirectTo.includes('/admin')) {
          PortalStore.set('admin');
        } else {
          PortalStore.set('user');
        }
        navigate(redirectTo, { replace: true });
        return;
      }

      if (isAdminPhone(profile?.phone) || adminIntent) {
        PortalStore.set('admin');
        navigate("/admin", { replace: true });
      } else {
        PortalStore.set('user');
        navigate("/home", { replace: true });
      }
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      const errorMsg = error.message ?? "Verification failed";
      setError(errorMsg);
      toast({
        title: 'Verification Failed',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!phone || countdown > 0) return;
    
    setResendLoading(true);
    setError('');

    try {
      // Setup reCAPTCHA again for resend
      setupRecaptcha('recaptcha-container-verify');
      
      // Small delay for reCAPTCHA setup
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const result = await sendOtp(phone);

      if (!result.success) {
        setError(result.error || 'Failed to resend OTP');
        return;
      }

      setCountdown(30);
      setOtp('');
      setError('');
      toast({
        title: 'OTP Resent',
        description: `New verification code sent to ${phone}`,
      });
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      setError(error.message || 'Failed to resend OTP. Please try again.');
      toast({
        title: 'Error',
        description: error.message || 'Failed to resend OTP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResendLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/auth');
  };

  if (!phone) {
    return null;
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Success Alert */}
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Verification code sent to {phone}
          </AlertDescription>
        </Alert>

        <Card className="shadow-card border-pink-100 gradient-card backdrop-blur-sm">
          <CardContent className="p-6">
            {/* Back Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-4 p-2 hover:bg-black/5"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>

            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">Verify OTP</h1>
              <p className="text-muted-foreground">
                Enter the 6-digit code sent to<br />
                <span className="font-mono font-medium">{maskPhone(phone)}</span>
              </p>
            </div>

            {/* OTP Input */}
            <div className="mb-6">
              <OtpBoxes
                value={otp}
                onChange={setOtp}
                disabled={loading}
                error={error}
              />
            </div>

            {/* Verify Button */}
            <Button
              onClick={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
              className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] disabled:scale-100 mb-4"
            >
              {loading && <CleaningLoader size="sm" className="mr-2" />}
              {state?.mode === 'signup' ? 'Verify & Create Account' : 'Verify & Continue'}
            </Button>

            {/* Resend OTP */}
            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Resend OTP in {countdown}s
                </p>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResendOTP}
                  disabled={resendLoading}
                  className="text-primary hover:text-primary-dark"
                >
                  {resendLoading && <CleaningLoader size="sm" className="mr-1" />}
                  Resend OTP
                </Button>
              )}
            </div>

            {/* Invisible reCAPTCHA container for resend */}
            <div id="recaptcha-container-verify"></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
