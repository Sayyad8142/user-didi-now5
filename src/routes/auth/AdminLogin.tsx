import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/features/profile/ensureProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function AdminLogin() {
  const nav = useNavigate();
  const [raw, setRaw] = useState("+91");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = normalizePhone(raw);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true },
      });
      
      if (error) throw error;
      
      // Persist for verify screen
      sessionStorage.setItem("otp_phone", phone);
      sessionStorage.setItem("otp_admin_intent", "1");
      sessionStorage.setItem("otp_last_sent", String(Date.now()));
      nav("/admin-verify", { replace: true, state: { phone } });
    } catch (err: any) {
      setError(err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-card border-pink-100 gradient-card backdrop-blur-sm">
        <CardContent className="p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-primary mb-2">Didi Now</h1>
            <p className="text-muted-foreground">Admin Login</p>
          </div>
          
          <form onSubmit={sendOtp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium">
                Admin Mobile Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                inputMode="numeric"
                placeholder="+91XXXXXXXXXX"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                disabled={loading}
                className="rounded-xl shadow-input transition-smooth focus:ring-2 focus:ring-primary/20"
              />
            </div>
            
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            
            <Button
              type="submit"
              disabled={loading || !phone}
              className="w-full h-12 rounded-full gradient-primary shadow-button transition-spring hover:scale-[1.02] disabled:scale-100"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send OTP
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => nav("/auth")}
              className="w-full h-11 rounded-full border-border hover:bg-accent hover:text-accent-foreground"
            >
              Back to User Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}