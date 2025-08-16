import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfile, normalizePhone } from "@/features/profile/ensureProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const RESEND_MS = 30000;

export default function AdminVerify() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const savedPhone = location.state?.phone || sessionStorage.getItem("otp_phone") || "";
  const phone = normalizePhone(savedPhone);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [resendAt, setResendAt] = useState<number>(() => {
    const last = Number(sessionStorage.getItem("otp_last_sent") || "0");
    return last ? last + RESEND_MS : Date.now();
  });
  
  const canResend = now >= resendAt;
  const left = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.trim().length !== 6 || !phone) return;
    setSending(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.verifyOtp({ 
        type: "sms", 
        token: code.trim(), 
        phone 
      });
      
      if (error) {
        setError(/expired|invalid/i.test(error.message) 
          ? "OTP expired/invalid. Resend and try again." 
          : error.message);
        return;
      }
      
      // Ensure profile exists; this will now wait for session and upsert with clear errors
      await ensureProfile();
      nav("/admin", { replace: true });
    } catch (e: any) {
      setError(e.message ?? "Verification failed");
    } finally {
      setSending(false);
    }
  }

  async function resend() {
    if (!phone || !canResend) return;
    setError(null);
    
    try {
      const { error } = await supabase.auth.signInWithOtp({ 
        phone, 
        options: { shouldCreateUser: true } 
      });
      
      if (error) throw error;
      
      const ts = Date.now();
      sessionStorage.setItem("otp_last_sent", String(ts));
      setResendAt(ts + RESEND_MS);
    } catch (err: any) {
      setError(err.message || "Failed to resend OTP");
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
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Verify & Continue
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={resend}
              disabled={!canResend}
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