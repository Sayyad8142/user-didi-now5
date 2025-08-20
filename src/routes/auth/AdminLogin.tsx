import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { formatPhoneIN, isValidINPhone, extractCleanPhone } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { PhoneInputIN } from "@/components/auth/PhoneInputIN";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, ArrowLeft } from "lucide-react";

const ADMIN_PHONE = (import.meta.env.VITE_ADMIN_PHONE || "+919000666986").replace(/\s/g,"");

export default function AdminLogin() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendOtp() {
    setErr(null); 
    setBusy(true);
    try {
      if (!isValidINPhone(phone)) {
        throw new Error("Please enter a valid 10-digit mobile number");
      }
      
      const e164 = formatPhoneIN(phone);
      if (e164 !== formatPhoneIN(extractCleanPhone(ADMIN_PHONE))) {
        throw new Error("Not an authorized admin number");
      }
      
      const { error } = await supabase.auth.signInWithOtp({ 
        phone: e164, 
        options: { shouldCreateUser: true } 
      });
      if (error) throw error;
      setOtpSent(true);
    } catch (e: any) { 
      setErr(e.message || "Failed to send OTP"); 
    } finally { 
      setBusy(false); 
    }
  }

  async function verify() {
    setErr(null); 
    setBusy(true);
    try {
      const e164 = formatPhoneIN(phone);
      const { data, error } = await supabase.auth.verifyOtp({ 
        phone: e164, 
        token: code, 
        type: "sms" 
      });
      if (error) throw error;
      nav("/admin", { replace: true });
    } catch (e: any) { 
      setErr(e.message || "Invalid code"); 
    } finally { 
      setBusy(false); 
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-card/95 backdrop-blur">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-primary">Admin Login</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {!otpSent ? (
            <>
              <PhoneInputIN
                value={phone}
                onChange={setPhone}
                placeholder="Enter mobile number"
                error={err || undefined}
                required
              />
              
              <Button 
                onClick={sendOtp} 
                disabled={busy || !phone.trim()} 
                className="w-full h-12 text-base font-medium"
                size="lg"
              >
                {busy ? "Sending OTP..." : "Send OTP"}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit OTP sent to
                  </p>
                  <p className="font-medium text-foreground">
                    +91 {phone}
                  </p>
                </div>
                
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={setCode}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                
                {err && (
                  <p className="text-sm text-destructive text-center animate-in slide-in-from-top-1 duration-200">
                    {err}
                  </p>
                )}
              </div>
              
              <Button 
                onClick={verify} 
                disabled={busy || code.length < 6} 
                className="w-full h-12 text-base font-medium"
                size="lg"
              >
                {busy ? "Verifying..." : "Verify & Continue"}
              </Button>
              
              <Button 
                onClick={() => {
                  setOtpSent(false);
                  setCode("");
                  setErr(null);
                }} 
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
              >
                Change number
              </Button>
            </>
          )}
          
          <Button 
            onClick={() => nav("/")} 
            variant="outline"
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}