import React, { useState, useEffect, useRef } from 'react';
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
import { ensureProfile, waitForSession, normalizePhone } from '@/features/profile/ensureProfile';
import { isDemoCredentials, setDemoSession } from '@/lib/demo';
import { useProfile } from '@/contexts/ProfileContext';
import { ConfirmationResult, signInWithPhoneNumber } from 'firebase/auth';
import { auth, getRecaptchaVerifier, clearRecaptchaVerifier } from '@/lib/firebase';
import { authenticateWithSupabase } from '@/lib/supabaseAuthFirebase';

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
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  
  const state = location.state as LocationState;
  
  const phone = state?.phone || "";
  const adminIntent = state?.adminLogin || false;
  const redirectTo = state?.redirectTo || (adminIntent ? "/admin" : "/home");
  
  // Get confirmation result from window (set by AuthCard)
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(
    () => (window as any).__firebaseConfirmationResult || null
  );
  
  // Redirect if no state
  useEffect(() => {
    if (!phone) {
      navigate('/auth');
    }
  }, [phone, navigate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearRecaptchaVerifier();
      delete (window as any).__firebaseConfirmationResult;
    };
  }, []);

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
        
        if (redirectTo) {
          navigate(redirectTo, { replace: true });
        } else {
          navigate("/home", { replace: true });
        }
        return;
      }

      // Verify OTP with Firebase
      if (!confirmationResult) {
        setError('Session expired. Please go back and resend OTP.');
        return;
      }

      const userCredential = await confirmationResult.confirm(otp.trim());
      console.log('Firebase OTP verified, user:', userCredential.user.uid);

      // Now authenticate with Supabase using Firebase token
      console.log('Authenticating with Supabase using Firebase token...');
      await authenticateWithSupabase();
      console.log('Supabase authentication successful');

      // Ensure session is set and profile exists
      await waitForSession();
      const profile = await ensureProfile();

      // If signup mode with additional data, update the profile
      if (state?.mode === 'signup' && state.signupData && profile) {
        console.log('📝 Updating profile with signup data:', {
          fullName: state.signupData.fullName,
          communityId: state.signupData.communityId,
          communityValue: state.signupData.communityValue,
          flatNo: state.signupData.flatNo,
          flatId: state.signupData.flatId,
          buildingId: state.signupData.buildingId
        });

        // Validate required fields before update
        if (!state.signupData.communityValue) {
          console.error('❌ Community value is missing!');
          toast({
            title: 'Signup Error',
            description: 'Community information is missing. Please try signing up again.',
            variant: 'destructive',
          });
          return;
        }

        if (!state.signupData.flatId || !state.signupData.flatNo) {
          console.error('❌ Flat information is missing!');
          toast({
            title: 'Signup Error',
            description: 'Flat information is missing. Please try signing up again.',
            variant: 'destructive',
          });
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
          return;
        }

        console.log('✅ Profile updated successfully');
        
        // Refresh ProfileContext to get updated data
        const freshProfile = await refreshProfile();
        console.log('✅ ProfileContext refreshed with:', freshProfile);
        
        // Small delay to ensure React state has propagated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        toast({
          title: 'Welcome to Didi Now!',
          description: 'Your account has been created successfully.',
        });
      } else {
        toast({
          title: 'Welcome back!',
          description: 'You have been signed in successfully.',
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
      
      // Handle specific Firebase errors
      let errorMsg = error.message ?? "Verification failed";
      
      if (error.code === 'auth/invalid-verification-code') {
        errorMsg = 'Invalid OTP. Please check and try again.';
      } else if (error.code === 'auth/code-expired') {
        errorMsg = 'OTP expired. Please resend and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMsg = 'Too many attempts. Please try again later.';
      }
      
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
      // Setup invisible reCAPTCHA
      const recaptchaVerifier = getRecaptchaVerifier('recaptcha-container-verify');
      
      // Send OTP via Firebase
      const newConfirmationResult = await signInWithPhoneNumber(
        auth,
        phone,
        recaptchaVerifier
      );
      
      // Update confirmation result
      setConfirmationResult(newConfirmationResult);
      (window as any).__firebaseConfirmationResult = newConfirmationResult;

      setCountdown(30);
      setOtp('');
      setError('');
      toast({
        title: 'OTP Resent',
        description: `New verification code sent to ${phone}`,
      });
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      clearRecaptchaVerifier();
      
      let errorMessage = 'Failed to resend OTP. Please try again.';
      
      if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please try again later.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setResendLoading(false);
    }
  };

  const handleBack = () => {
    clearRecaptchaVerifier();
    delete (window as any).__firebaseConfirmationResult;
    navigate('/auth');
  };

  if (!phone) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      {/* Invisible reCAPTCHA container for resend */}
      <div id="recaptcha-container-verify" ref={recaptchaContainerRef}></div>
      
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
