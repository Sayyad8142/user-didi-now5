import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OtpBoxes } from '@/components/auth/OtpBoxes';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/contexts/ProfileContext';
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { ensureProfile } from '@/features/profile/ensureProfile';
import { isAdminPhone } from '@/features/auth/isAdmin';
import { sendFirebaseOTP, clearRecaptchaVerifier, auth as firebaseAuth } from '@/lib/firebase';

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const RESEND_MS = 30000;

interface LocationState {
  phone: string;
  mode: 'signin' | 'signup';
  signupData?: { fullName: string; phone: string; communityId: string; communityValue: string; buildingId: string; flatId: string; flatNo: string; } | null;
  redirectTo?: string;
}

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { refresh: refreshProfile, profile } = useProfile();
  const state = location.state as LocationState;

  const savedPhone = state?.phone || sessionStorage.getItem("otp_phone") || "";
  const mode = state?.mode || 'signin';
  const signupData = state?.signupData || null;
  const redirectTo = state?.redirectTo;

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugError, setDebugError] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [resendAt, setResendAt] = useState<number>(() => {
    const last = Number(sessionStorage.getItem("otp_last_sent") || "0");
    return last ? last + RESEND_MS : Date.now();
  });

  const showDebug = import.meta.env.DEV || searchParams.get('debug') === '1';
  const canResend = now >= resendAt;
  const countdown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      clearRecaptchaVerifier();
    };
  }, []);

  const handleResend = async () => {
    if (!canResend || !savedPhone) return;
    setError('');
    setLoading(true);

    try {
      const confirmationResult = await sendFirebaseOTP(savedPhone, 'recaptcha-container-verify');
      (window as any).__firebaseConfirmationResult = confirmationResult;
      
      const ts = Date.now();
      sessionStorage.setItem("otp_last_sent", String(ts));
      setResendAt(ts + RESEND_MS);
      toast({ title: 'OTP Sent', description: 'New verification code sent.' });
    } catch (e: any) {
      console.error('Resend OTP error:', e);
      setError(e.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    setError('');
    setDebugError(null);

    try {
      const confirmationResult = (window as any).__firebaseConfirmationResult;
      if (!confirmationResult) {
        setError('Session expired. Please go back and request a new OTP.');
        return;
      }

      // Verify OTP with Firebase
      console.log("[AUTH] Verifying OTP with Firebase...");
      const userCredential = await confirmationResult.confirm(otp.trim());
      const fbUser = userCredential.user;
      console.log("[AUTH] Firebase UID:", fbUser.uid);

      // Wait for Firebase auth state to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if Firebase user is authenticated
      const currentUser = firebaseAuth.currentUser;
      if (!currentUser) {
        console.error("[AUTH] Firebase currentUser is null after OTP verification");
        throw new Error("Firebase authentication failed - no current user");
      }
      console.log("[AUTH] Firebase currentUser confirmed:", currentUser.uid);

      // Get Firebase ID token to verify it works
      const idToken = await currentUser.getIdToken(true);
      console.log("[AUTH] Got Firebase ID token, length:", idToken?.length);

      // Clear OTP session data
      sessionStorage.removeItem("otp_phone");
      sessionStorage.removeItem("otp_last_sent");
      delete (window as any).__firebaseConfirmationResult;

      // Ensure profile exists in Supabase - uses firebase_uid, NOT id
      // ensureProfile queries by firebase_uid and inserts WITHOUT setting id (UUID auto-generated)
      const profileResult = await ensureProfile();
      console.log("[AUTH] Profile UUID:", profileResult?.id, "Firebase UID:", profileResult?.firebase_uid);
      
      await refreshProfile();

      toast({ title: 'Welcome!', description: 'You are now logged in.' });
      navigate(redirectTo || (isAdminPhone(profile?.phone) ? "/admin" : "/home"), { replace: true });
    } catch (e: any) {
      console.error('Verify OTP error:', e);
      setDebugError(e);
      if (e.code === 'auth/invalid-verification-code') {
        setError('Invalid OTP. Please check and try again.');
      } else if (e.code === 'auth/code-expired') {
        setError('OTP expired. Please request a new one.');
      } else {
        setError(e.message || 'Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!savedPhone) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
        <Card className="max-w-sm w-full shadow-card border-pink-100 gradient-card backdrop-blur-sm">
          <CardContent className="p-6 text-center space-y-4">
            <p className="text-muted-foreground">Session expired. Please start again.</p>
            <Button onClick={() => navigate('/auth')} className="w-full h-11 rounded-full gradient-primary">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div id="recaptcha-container-verify" />
      <div className="w-full max-w-md space-y-4">
        {showDebug && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 text-xs p-3 rounded-lg font-mono">
            <div><strong>DEBUG INFO (Firebase Third-Party Auth)</strong></div>
            <div>Supabase URL: {SUPABASE_URL}</div>
            <div>Auth Method: Firebase Phone OTP + accessToken</div>
            <div>Firebase User: {firebaseAuth.currentUser?.uid ?? 'null'}</div>
            {debugError && (
              <div className="mt-2 break-all">
                <strong>Error:</strong>
                <div>Code: {debugError?.code ?? 'N/A'}</div>
                <div>Message: {debugError?.message ?? 'N/A'}</div>
                <details className="mt-1">
                  <summary className="cursor-pointer">Full Error JSON</summary>
                  <pre className="whitespace-pre-wrap text-[10px] mt-1">{JSON.stringify(debugError, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        )}
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Verification code sent to {savedPhone}</AlertDescription>
        </Alert>
        <Card className="shadow-card border-pink-100 gradient-card backdrop-blur-sm">
          <CardContent className="p-6 space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-primary mb-2">Verify OTP</h1>
              <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to your phone</p>
            </div>
            <OtpBoxes value={otp} onChange={setOtp} disabled={loading} />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button onClick={handleVerify} disabled={loading || otp.length !== 6} className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] disabled:scale-100">
              {loading && <CleaningLoader size="sm" className="mr-2" />}
              Verify & Continue
            </Button>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={handleResend} disabled={!canResend || loading} className="w-full h-11 rounded-full border-border hover:bg-accent hover:text-accent-foreground">
                {canResend ? 'Resend OTP' : `Resend in ${countdown}s`}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/auth')} disabled={loading} className="w-full h-11 rounded-full">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
