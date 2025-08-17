import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { verifyAdminEmailOtp } from "@/features/auth/adminEmailAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminEmailVerify() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const email = useMemo(()=> (sp.get("email") || "").toLowerCase(), [sp]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(()=>{ if(!email) nav("/admin-login-email"); }, [email, nav]);

  async function onVerify() {
    setErr(null);
    try {
      setBusy(true);
      await verifyAdminEmailOtp(email, code);
      // session is persisted automatically; go to admin
      nav("/admin", { replace: true });
    } catch (e:any) {
      setErr(e.message || "Invalid or expired code");
    } finally { setBusy(false); }
  }

  async function onResend() {
    try {
      setBusy(true);
      await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      setErr("Code sent again.");
    } catch (e:any) {
      setErr(e.message || "Failed to resend");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-rose-50/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow p-5 space-y-4">
        <h1 className="text-2xl font-bold text-[#ff007a]">Verify OTP</h1>
        <p className="text-sm text-gray-600">Enter the 6-digit code sent to <b>{email}</b></p>
        <Input
          inputMode="numeric" maxLength={6}
          value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,""))}
          placeholder="Enter 6-digit code"
        />
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <Button onClick={onVerify} disabled={busy || code.length !== 6} className="w-full bg-[#ff007a] text-white">
          {busy ? "Verifying..." : "Verify & Continue"}
        </Button>
        <Button variant="outline" onClick={onResend} disabled={busy} className="w-full">
          Resend Code
        </Button>
        <Button variant="ghost" onClick={()=>nav("/admin-login-email")} className="w-full">
          Back to Admin Login
        </Button>
      </div>
    </div>
  );
}