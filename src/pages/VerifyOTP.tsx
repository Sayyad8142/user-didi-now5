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
import { normalizePhone } from '@/features/profile/ensureProfile';
import { isDemoCredentials, setDemoSession, clearDemoSession } from '@/lib/demo';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/components/auth/AuthProvider';
import { verifyOtp, sendOtp, getCurrentUser, setupRecaptcha, shouldUseNativeAuth, isWeb } from '@/lib/firebase';

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
  const { refresh: refreshProfile } = useProfile();
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
        // Use list query (not maybeSingle) to avoid errors if legacy duplicates exist.
        const orExpr = phoneCandidates.map(p => `phone.eq.${p}`).join(',');
        const { data: rows, error: byPhoneErr } = await supabase
          .from('profiles')
          .select('*')
          .or(orExpr)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (byPhoneErr) {
          console.error('Error fetching profile by phone:', byPhoneErr);
          throw byPhoneErr;
        }

        byPhone = rows?.[0] ?? null;
      }

      if (byPhone) {
        // Phone is already registered: attach/re-link firebase_uid
        // (This can happen if the Firebase user was recreated and got a new UID.)
        if (byPhone.firebase_uid && byPhone.firebase_uid !== firebaseUid) {
          console.warn(
            'ℹ️ Re-linking phone to new firebase_uid:',
            byPhone.id,
            byPhone.firebase_uid,
            '→',
            firebaseUid
          );
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

      // Notify AuthProvider of native auth change so it picks up the new user
      if (shouldUseNativeAuth()) {
        window.dispatchEvent(new Event('native-auth-changed'));
      }

      // Ensure profile exists in Supabase
      const profile = await ensureFirebaseProfile(uid, userPhone);
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
        await refreshProfile();
        
        toast({
          title: 'Welcome to Didi Now!',
          description: 'Your account has been created successfully.',
        });
      } else {
        // For sign-in, also refresh profile to ensure latest data
        await refreshProfile();
        
        toast({
          title: 'Login Successful',
          description: 'Welcome back!',
        });
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
      // Setup reCAPTCHA for resend — ONLY on web
      if (!shouldUseNativeAuth()) {
        setupRecaptcha('recaptcha-container-verify');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
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

            {/* Invisible reCAPTCHA container for resend — web only */}
            {!shouldUseNativeAuth() && <div id="recaptcha-container-verify"></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
