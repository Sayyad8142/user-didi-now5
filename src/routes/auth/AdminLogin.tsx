import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { normalizePhone } from "@/features/profile/ensureProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const ADMIN_PHONE = (import.meta.env.VITE_ADMIN_PHONE || "+919000666986").replace(/\s/g,"");

export default function AdminLogin() {
  const nav = useNavigate();
  const [phone, setPhone] = useState(ADMIN_PHONE);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendOtp() {
    setErr(null); 
    setBusy(true);
    try {
      const e164 = normalizePhone(phone);
      if (e164 !== normalizePhone(ADMIN_PHONE)) {
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
      const e164 = normalizePhone(phone);
      const { data, error } = await supabase.auth.verifyOtp({ 
        phone: e164, 
        token: code, 
        type: "sms" 
      });
      if (error) throw error;
      // persist session handled by client config
      nav("/admin", { replace: true });
    } catch (e: any) { 
      setErr(e.message || "Invalid code"); 
    } finally { 
      setBusy(false); 
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center p-4 bg-rose-50/50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-5 space-y-3">
        <h1 className="text-2xl font-bold text-[#ff007a]">Admin Login</h1>
        {!otpSent ? (
          <>
            <Input 
              className="w-full border rounded p-2" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
            />
            {err && <div className="text-sm text-rose-600">{err}</div>}
            <Button 
              onClick={sendOtp} 
              disabled={busy} 
              className="w-full h-10 rounded bg-[#ff007a] text-white"
            >
              {busy ? "Sending..." : "Send OTP"}
            </Button>
          </>
        ) : (
          <>
            <Input 
              className="w-full border rounded p-2" 
              value={code} 
              onChange={e => setCode(e.target.value.replace(/\D/g,""))} 
              placeholder="Enter 6-digit OTP" 
            />
            {err && <div className="text-sm text-rose-600">{err}</div>}
            <Button 
              onClick={verify} 
              disabled={busy || code.length < 4} 
              className="w-full h-10 rounded bg-[#ff007a] text-white"
            >
              {busy ? "Verifying..." : "Verify & Continue"}
            </Button>
          </>
        )}
        <Button 
          onClick={() => nav("/")} 
          variant="outline"
          className="w-full h-10 rounded border"
        >
          Back
        </Button>
      </div>
    </div>
  );
}