import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ensureProfile, normalizePhone } from "@/features/profile/ensureProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CleaningLoader } from '@/components/ui/cleaning-loader';
import { sendFirebaseOTP, clearRecaptchaVerifier, auth as firebaseAuth } from "@/lib/firebase";

const RESEND_MS = 30000;

export default function AdminVerify() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const savedPhone = location.state?.phone || sessionStorage.getItem("admin_otp_phone") || "";
  const phone = normalizePhone(savedPhone);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [resendAt, setResendAt] = useState<number>(() => {
    const last = Number(sessionStorage.getItem("admin_otp_last_sent") || "0");
    return last ? last + RESEND_MS : Date.now();
  });
  
  const canResend = now >= resendAt;
  const left = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      clearRecaptchaVerifier();
    };
  }, []);

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.trim().length !== 6 || !phone) return;
    setSending(true);
    setError(null);
    
    try {
      const confirmationResult = (window as any).__adminFirebaseConfirmationResult;
      if (!confirmationResult) {
        setError("Session expired. Please go back and request a new OTP.");
        return;
      }

      // Verify OTP with Firebase
      console.log("[AdminVerify] Verifying OTP with Firebase...");
      const userCredential = await confirmationResult.confirm(code.trim());
      console.log("[AdminVerify] Firebase OTP verified, user:", userCredential.user.uid);

      // Wait for Firebase auth state
      await new Promise(resolve => setTimeout(resolve, 500));

      const currentUser = firebaseAuth.currentUser;
      if (!currentUser) {
        throw new Error("Firebase authentication failed");
      }
      
      // Ensure profile exists
      await ensureProfile();

      // Cleanup
      delete (window as any).__adminFirebaseConfirmationResult;
      sessionStorage.removeItem("admin_otp_phone");
      sessionStorage.removeItem("admin_otp_last_sent");
      
      nav("/admin", { replace: true });
    } catch (e: any) {
      console.error('AdminVerify error:', e);
      if (e.code === 'auth/invalid-verification-code') {
        setError('Invalid OTP. Please check and try again.');
      } else if (e.code === 'auth/code-expired') {
        setError('OTP expired. Please request a new one.');
      } else {
        setError(e.message ?? "Verification failed");
      }
    } finally {
      setSending(false);
    }
  }

  async function resend() {
    if (!phone || !canResend) return;
    setError(null);
    setSending(true);
    
    try {
      // Use Firebase Phone Auth
      const confirmationResult = await sendFirebaseOTP(phone, 'admin-recaptcha-container-verify');
      (window as any).__adminFirebaseConfirmationResult = confirmationResult;
      
      const ts = Date.now();
      sessionStorage.setItem("admin_otp_last_sent", String(ts));
      setResendAt(ts + RESEND_MS);
    } catch (err: any) {
      console.error('Admin resend OTP error:', err);
      clearRecaptchaVerifier();
      setError(err.message || "Failed to resend OTP");
    } finally {
      setSending(false);
    }
  }

  if (!phone) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
        <Card className="w-full max-w-sm shadow-card border-pink-100 gradient-card backdrop-blur-sm">
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-destructive font-semibold">Session expired</div>
            <p className="text-sm text-muted-foreground">Please start again.</p>
            <Button 
              onClick={() => nav("/admin-login", { replace: true })} 
              className="w-full h-11 rounded-full gradient-primary"
            >
              Go to Admin Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const maskedPhone = phone.replace(/(\+91)(\d{6})(\d{4})/, "$1 XXXXXX$3");

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div id="admin-recaptcha-container-verify" />
      <Card className="w-full max-w-sm shadow-card border-pink-100 gradient-card backdrop-blur-sm">
        <CardContent className="p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-primary mb-2">Admin</h1>
            <p className="text-muted-foreground">Verify OTP</p>
            <p className="text-sm text-muted-foreground mt-2">
              We sent a code to {maskedPhone}
            </p>
          </div>

          <form onSubmit={verify} className="space-y-4">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-12 w-full rounded-xl shadow-input tracking-widest text-center text-xl font-mono focus:ring-2 focus:ring-primary/20"
              disabled={sending}
            />

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              disabled={sending || code.length !== 6}
              className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] disabled:scale-100"
            >
              {sending && <CleaningLoader size="sm" className="mr-2" />}
              Verify & Continue
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={resend}
              disabled={!canResend || sending}
              className="w-full h-11 rounded-full border-border hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
            >
              {canResend ? "Resend OTP" : `Resend OTP in ${left}s`}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => nav("/admin-login")}
              className="w-full h-11 rounded-full border-border hover:bg-accent hover:text-accent-foreground"
            >
              Back to Admin Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
