import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sendAdminEmailOtp, isWhitelistedAdminEmail } from "@/features/auth/adminEmailAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminEmailLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState(import.meta.env.VITE_ADMIN_EMAIL || "team@didisnow.com");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSend() {
    setErr(null);
    const e = email.trim().toLowerCase();
    if (!isWhitelistedAdminEmail(e)) { setErr("This email is not authorized."); return; }
    try {
      setBusy(true);
      await sendAdminEmailOtp(e);
      nav(`/admin-email-verify?email=${encodeURIComponent(e)}`);
    } catch (e:any) {
      setErr(e.message || "Failed to send OTP");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-rose-50/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow p-5 space-y-4">
        <h1 className="text-2xl font-bold text-[#ff007a]">Admin Login</h1>
        <p className="text-sm text-gray-600">Enter admin email to receive a 6-digit code.</p>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <Button onClick={onSend} disabled={busy} className="w-full bg-[#ff007a] text-white">
          {busy ? "Sending..." : "Send OTP"}
        </Button>
        <Button variant="outline" onClick={()=>nav("/")} className="w-full">Back</Button>
      </div>
    </div>
  );
}