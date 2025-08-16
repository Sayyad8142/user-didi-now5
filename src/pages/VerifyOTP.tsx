import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OtpBoxes } from '@/components/auth/OtpBoxes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { maskPhone } from '@/lib/auth-helpers';
import { ensureProfile } from '@/features/profile/ensureProfile';
import { isAdminPhone } from '@/features/auth/isAdmin';

interface LocationState {
  phone: string;
  mode: 'signin' | 'signup';
  signupData?: {
    fullName: string;
    phone: string;
    community: string;
    flatNo: string;
  } | null;
  adminLogin?: boolean;
  redirectTo?: string;
}

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const state = location.state as LocationState;
  
  // Redirect if no state
  useEffect(() => {
    if (!state?.phone || !state?.mode) {
      navigate('/auth');
    }
  }, [state, navigate]);

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
    if (otp.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verify OTP
      const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
        phone: state.phone,
        token: otp,
        type: 'sms',
      });

      if (verifyError) throw verifyError;

      const user = authData.user;
      if (!user) throw new Error('Authentication failed');

      // Ensure profile exists and is normalized
      const profile = await ensureProfile();

      // If signup mode with additional data, update the profile
      if (state.mode === 'signup' && state.signupData && profile) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: state.signupData.fullName,
            community: state.signupData.community,
            flat_no: state.signupData.flatNo,
          })
          .eq('id', user.id);

        if (updateError) {
          console.error('Profile update error:', updateError);
          toast({
            title: 'Warning',
            description: 'Account created but profile setup incomplete. Please complete your profile.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Welcome to Didi Now!',
            description: 'Your account has been created successfully.',
          });
        }
      } else {
        toast({
          title: 'Welcome back!',
          description: 'You have been signed in successfully.',
        });
      }

      // Determine redirect destination
      let redirectTo = state.redirectTo;
      
      if (!redirectTo) {
        // Fallback logic: check if phone is in admin whitelist or admin intent
        if (isAdminPhone(profile?.phone) || state.adminLogin) {
          redirectTo = '/admin';
        } else {
          redirectTo = '/home';
        }
      }
      
      navigate(redirectTo, { replace: true });
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      setError(error.message || 'Invalid verification code. Please try again.');
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid verification code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setResendLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: state.phone,
        options: {
          channel: 'sms',
        },
      });

      if (error) throw error;

      setCountdown(30);
      setOtp('');
      toast({
        title: 'OTP Resent',
        description: `New verification code sent to ${state.phone}`,
      });
    } catch (error: any) {
      console.error('Resend OTP error:', error);
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

  if (!state?.phone) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card border-pink-100 gradient-card backdrop-blur-sm">
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
              Enter the 6-digit code sent to {maskPhone(state.phone)}
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
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {state.mode === 'signup' ? 'Verify & Create Account' : 'Verify & Continue'}
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
                {resendLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Resend OTP
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}