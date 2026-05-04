import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
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
import { bootstrapProfileViaEdge } from '@/lib/profileBootstrap';
import { isDemoCredentials, setDemoSession, clearDemoSession } from '@/lib/demo';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/components/auth/AuthProvider';
import { verifyOtp, sendOtp, shouldUseNativeAuth } from '@/lib/firebase';

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
  redirectTo?: string;
}


export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { bootstrapProfile } = useProfile();
  const { user: authUser } = useAuth();
  
  const state = location.state as LocationState;
  
  const phone = state?.phone || "";
  const redirectTo = state?.redirectTo || "/home";

  // Track pending redirect after successful OTP verification
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  
  // Redirect if no state
  useEffect(() => {
    if (!phone) {
      navigate('/auth');
    }
  }, [phone, navigate]);

  // Wait for AuthProvider to pick up the authenticated user, then navigate
  useEffect(() => {
    if (pendingRedirect && authUser) {
      console.log('✅ VerifyOTP: AuthProvider has user, navigating to', pendingRedirect);
      navigate(pendingRedirect, { replace: true });
      setPendingRedirect(null);
    }
  }, [pendingRedirect, authUser, navigate]);

  // Safety timeout: if AuthProvider doesn't update within 5s, force navigate
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (pendingRedirect && !authUser) {
      timeoutRef.current = setTimeout(() => {
        console.warn('⚠️ VerifyOTP: AuthProvider did not update in 5s, force navigating');
        navigate(pendingRedirect, { replace: true });
        setPendingRedirect(null);
      }, 5000);
      return () => clearTimeout(timeoutRef.current);
    }
  }, [pendingRedirect, authUser, navigate]);

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [error, setError] = useState('');
  const autoSubmitTriggered = useRef(false);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);


  // Ensure profile exists via secure edge function (service-role bootstrap).
  // Direct inserts from the frontend are blocked by RLS because the Supabase
  // client is anonymous (Firebase is the identity provider).
  const ensureFirebaseProfile = async (firebaseUid: string, phoneNumber: string) => {
    try {
      const profile = await bootstrapProfileViaEdge({
        phone: phoneNumber,
        signupData: state?.mode === 'signup' ? state.signupData ?? null : null,
      });
      console.log('✅ Profile bootstrapped:', profile.id);
      return profile;
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

      // Get the user uid — native returns nativeUser, web returns user
      const uid = result.user?.uid || result.nativeUser?.uid;
      const userPhone = result.user?.phoneNumber || result.nativeUser?.phoneNumber || phone;

      console.log('✅ Firebase auth successful:', uid);

      if (!uid) {
        setError('Authentication failed. Please try again.');
        setLoading(false);
        return;
      }

      // IMPORTANT: if user previously used Guest/Demo mode, clear it now so UI doesn't stay "Guest"
      clearDemoSession();

      // Notify AuthProvider of native auth change so it picks up the new user.
      // Pass the verified UID/phone in the event payload so AuthProvider can
      // apply it immediately, even before the native plugin's internal state syncs.
      // This is the key fix for "first login on Android APK shows empty data until restart".
      if (shouldUseNativeAuth()) {
        window.dispatchEvent(
          new CustomEvent('native-auth-changed', {
            detail: { uid, phoneNumber: userPhone },
          })
        );
      }

      // Ensure profile exists in Supabase
      const profile = await ensureFirebaseProfile(uid, userPhone);

      // Immediately hydrate ProfileContext from the verified native/web auth payload
      // so Home/Profile/Wallet don't sit in an empty state waiting for the provider
      // to observe auth on slower Android devices.
      await bootstrapProfile({ id: uid, phone: userPhone });
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
        
        // Wait for profile context to refresh with updated data
        await bootstrapProfile({ id: uid, phone: userPhone });
        
        toast({
          title: 'Welcome to Didi Now!',
          description: 'Your account has been created successfully.',
        });
      } else {
        // For sign-in, also refresh profile to ensure latest data
        await bootstrapProfile({ id: uid, phone: userPhone });
        
        toast({
          title: 'Login Successful',
          description: 'Welcome back!',
        });
      }

      // Invalidate all user-dependent caches so wallet/home/bookings refetch
      // immediately with the freshly-created profile (no stale empty state).
      try {
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ['wallet-balance'] }),
          queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] }),
          queryClient.invalidateQueries({ queryKey: ['bookings'] }),
          queryClient.invalidateQueries({ queryKey: ['my-bookings'] }),
          queryClient.invalidateQueries({ queryKey: ['active-booking'] }),
          queryClient.invalidateQueries({ queryKey: ['communities'] }),
          queryClient.invalidateQueries({ queryKey: ['favorite-workers'] }),
          queryClient.invalidateQueries({ queryKey: ['online-worker-counts'] }),
        ]);
      } catch (e) {
        console.warn('Post-login invalidate failed (non-fatal):', e);
      }
      if (redirectTo) {
        console.log('🔄 VerifyOTP: OTP verified, waiting for AuthProvider to update before navigating to', redirectTo);
        setPendingRedirect(redirectTo);
        return;
      }

      console.log('🔄 VerifyOTP: OTP verified, waiting for AuthProvider to update before navigating to /home');
      setPendingRedirect("/home");
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
      const result = await sendOtp(phone, shouldUseNativeAuth() ? 'recaptcha-container' : 'recaptcha-container-verify');

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

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (otp.length === 6 && !loading && !autoSubmitTriggered.current && !pendingRedirect) {
      autoSubmitTriggered.current = true;
      handleVerifyOTP();
    }
    if (otp.length < 6) {
      autoSubmitTriggered.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  if (!phone) {
    return null;
  }

  // Show a full-screen loading state while waiting to redirect after successful OTP
  if (pendingRedirect) {
    return (
      <div className="min-h-screen gradient-bg flex flex-col items-center justify-center p-4 gap-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 animate-pulse" />
        <p className="text-lg font-semibold text-foreground">Login Successful</p>
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
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

            {/* reCAPTCHA removed — Twilio Verify handles OTP delivery without captcha. */}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
