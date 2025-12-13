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
import { ensureProfile, waitForSession, normalizePhone } from '@/features/profile/ensureProfile';
import { isDemoCredentials, setDemoSession } from '@/lib/demo';
import { useProfile } from '@/contexts/ProfileContext';

interface LocationState {
  phone: string;
  mode: 'signin' | 'signup';
  signupData?: { fullName: string; phone: string; communityId: string; communityValue: string; buildingId: string; flatId: string; flatNo: string; } | null;
  adminLogin?: boolean;
  redirectTo?: string;
}

function isAdminPhone(phone?: string | null) {
  const env = import.meta.env.VITE_ADMIN_PHONES ?? "";
  const target = normalizePhone(phone ?? "");
  if (!target) return false;
  return env.split(",").map((s: string) => normalizePhone(s.trim())).filter(Boolean).includes(target);
}

const RESEND_MS = 30000;

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { refresh: refreshProfile } = useProfile();
  const state = location.state as LocationState;
  const savedPhone = state?.phone || sessionStorage.getItem("otp_phone") || "";
  const phone = normalizePhone(savedPhone);
  const adminIntent = state?.adminLogin || false;
  const redirectTo = state?.redirectTo || (adminIntent ? "/admin" : "/home");

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [resendAt, setResendAt] = useState<number>(() => {
    const last = Number(sessionStorage.getItem("otp_last_sent") || "0");
    return last ? last + RESEND_MS : Date.now();
  });

  const canResend = now >= resendAt;
  const countdown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!phone) navigate('/auth');
  }, [phone, navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const handleVerifyOTP = async () => {
    if (!phone) { setError("Session expired."); return; }
    if (otp.trim().length !== 6) { setError('Please enter the complete 6-digit code'); return; }
    setLoading(true); setError('');

    try {
      if (isDemoCredentials(phone, otp)) { 
        setDemoSession(); 
        toast({ title: 'Demo Login Successful' }); 
        navigate(redirectTo || "/home", { replace: true }); 
        return; 
      }

      // Use Supabase native OTP verification
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: "sms",
        token: otp.trim(),
        phone
      });

      if (verifyError) {
        if (/expired|invalid/i.test(verifyError.message)) {
          setError('OTP expired/invalid. Resend and try again.');
        } else {
          setError(verifyError.message);
        }
        return;
      }

      await waitForSession();
      const profile = await ensureProfile();

      if (state?.mode === 'signup' && state.signupData && profile) {
        if (!state.signupData.communityValue || !state.signupData.flatId) { 
          toast({ title: 'Signup Error', description: 'Missing data.', variant: 'destructive' }); 
          return; 
        }
        const { error: updateError } = await supabase.from('profiles').update({ 
          full_name: state.signupData.fullName, 
          community: state.signupData.communityValue, 
          flat_no: state.signupData.flatNo, 
          community_id: state.signupData.communityId, 
          building_id: state.signupData.buildingId || null, 
          flat_id: state.signupData.flatId 
        }).eq('id', profile.id);
        
        if (updateError) { 
          toast({ title: 'Signup Failed', description: updateError.message, variant: 'destructive' }); 
          return; 
        }
        await refreshProfile();
        await new Promise(r => setTimeout(r, 100));
        toast({ title: 'Welcome to Didi Now!' });
      } else { 
        toast({ title: 'Welcome back!' }); 
      }

      const { PortalStore } = await import('@/lib/portal');
      if (redirectTo?.includes('/admin')) PortalStore.set('admin'); 
      else PortalStore.set('user');
      navigate(redirectTo || (isAdminPhone(profile?.phone) ? "/admin" : "/home"), { replace: true });
    } catch (e: any) {
      console.error('Verify OTP error:', e);
      setError(e.message ?? "Verification failed");
    } finally { 
      setLoading(false); 
    }
  };

  const handleResendOTP = async () => {
    if (!phone || !canResend) return;
    setError('');
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true }
      });

      if (error) throw error;

      const ts = Date.now();
      sessionStorage.setItem("otp_last_sent", String(ts));
      setResendAt(ts + RESEND_MS);
      setOtp('');
      toast({ title: 'OTP Resent' });
    } catch (e: any) {
      console.error('Resend OTP error:', e);
      setError(e.message || 'Failed to resend OTP.');
    }
  };

  const handleBack = () => {
    navigate('/auth');
  };

  if (!phone) return null;

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Verification code sent to {savedPhone}</AlertDescription>
        </Alert>
        
        <Card className="shadow-card border-pink-100 gradient-card backdrop-blur-sm">
          <CardContent className="p-6">
            <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4 p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">Verify OTP</h1>
              <p className="text-muted-foreground">
                Enter the 6-digit code sent to<br />
                <span className="font-mono font-medium">{maskPhone(savedPhone)}</span>
              </p>
            </div>
            
            <div className="mb-6">
              <OtpBoxes value={otp} onChange={setOtp} disabled={loading} error={error} />
            </div>
            
            <Button 
              onClick={handleVerifyOTP} 
              disabled={loading || otp.length !== 6} 
              className="w-full h-12 rounded-full gradient-primary shadow-button mb-4"
            >
              {loading && <CleaningLoader size="sm" className="mr-2" />}
              {state?.mode === 'signup' ? 'Verify & Create Account' : 'Verify & Continue'}
            </Button>
            
            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-sm text-muted-foreground">Resend OTP in {countdown}s</p>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleResendOTP} className="text-primary">
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
