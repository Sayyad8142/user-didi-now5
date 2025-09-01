import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OtpBoxes } from '@/components/auth/OtpBoxes';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { maskPhone } from '@/lib/auth-helpers';
import { ensureProfile, waitForSession, normalizePhone } from '@/features/profile/ensureProfile';
import { isDemoCredentials, setDemoSession } from '@/lib/demo';

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
        // Handle demo login
        console.log('Demo login detected');
        setDemoSession();
        
        toast({
          title: 'Demo Login Successful',
          description: 'You are now logged in as a demo user.',
        });
        
        // Navigate directly for demo user
        if (redirectTo) {
          navigate(redirectTo, { replace: true });
        } else {
          navigate("/home", { replace: true });
        }
        return;
      }

      // Verify OTP for regular users
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: "sms",
        token: otp.trim(),
        phone, // must match the phone used to send OTP
      });

      if (verifyError) {
        const errorMsg = /expired|invalid/i.test(verifyError.message)
          ? "OTP expired or invalid. Resend and try again."
          : verifyError.message;
        setError(errorMsg);
        return;
      }

      // Ensure session is set and profile exists
      await waitForSession();
      const profile = await ensureProfile();

      // If signup mode with additional data, update the profile
      if (state?.mode === 'signup' && state.signupData && profile) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: state.signupData.fullName,
            community: state.signupData.community,
            flat_no: state.signupData.flatNo,
          })
          .eq('id', profile.id);

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

      // Prefer explicit redirect target; else admin check
      if (redirectTo) {
        navigate(redirectTo, { replace: true });
        return;
      }
      if (isAdminPhone(profile?.phone) || adminIntent) {
        navigate("/admin", { replace: true });
      } else {
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
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          channel: 'sms',
          shouldCreateUser: true,
        },
      });

      if (error) {
        setError(error.message);
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
    return null; // Will redirect to auth
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
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
                  {resendLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
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