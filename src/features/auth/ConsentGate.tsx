import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle, FileText, Shield } from "lucide-react";

type GateState = "loading" | "needs-consent" | "ok";

async function getCurrentLegalVersion() {
  const { data, error } = await supabase
    .from("ops_settings")
    .select("value")
    .eq("key", "current_legal_version")
    .single();
  return error ? null : (data?.value as string | null);
}

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [profile, setProfile] = useState<any>(null);
  const [ver, setVer] = useState<string | null>(null);
  const [agreeTos, setAgreeTos] = useState(false);
  const [agreePriv, setAgreePriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const [{ data: auth }, v] = await Promise.all([
        supabase.auth.getUser(),
        getCurrentLegalVersion(),
      ]);
      setVer(v);
      const uid = auth.user?.id;
      if (!uid) { 
        setState("ok"); 
        return; 
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, phone, legal_version, tos_accepted_at, privacy_accepted_at, firebase_uid")
        .eq("firebase_uid", uid)
        .single();

      setProfile(p);
      const acceptedCurrent =
        !!p?.tos_accepted_at &&
        !!p?.privacy_accepted_at &&
        (!!v ? p?.legal_version === v : true);

      setState(acceptedCurrent ? "ok" : "needs-consent");
    })();
  }, []);

  async function accept() {
    if (!profile?.id) return;
    if (!agreeTos || !agreePriv) return;
    setBusy(true);
    
    try {
      // Ensure we have a valid session first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('Session error:', sessionError);
        // Redirect to auth if session is invalid
        window.location.href = '/auth';
        return;
      }

      const now = new Date().toISOString();
      const updateData: Record<string, any> = {
        tos_accepted_at: now,
        privacy_accepted_at: now,
      };
      if (ver) updateData.legal_version = ver;

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("firebase_uid", profile.firebase_uid);
      
      if (error) {
        console.error('Profile update error:', error);
        // If it's an auth error, redirect to login
        if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
          window.location.href = '/auth';
          return;
        }
      } else {
        setState("ok");
      }
    } catch (err) {
      console.error('Consent accept error:', err);
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }
  
  if (state === "ok") return <>{children}</>;

  // needs-consent
  return (
    <div className="min-h-dvh bg-background p-4 flex items-center justify-center">
      <div className="mx-auto max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="h-16 w-16 bg-primary rounded-full flex items-center justify-center mx-auto">
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="text-2xl font-bold text-foreground">Welcome to Didi Now</div>
          <p className="text-sm text-muted-foreground">
            Before you start, please review and accept our Terms of Service and Privacy Policy.
          </p>
        </div>

        <div className="rounded-xl bg-card border shadow-sm p-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <input 
                id="tos" 
                type="checkbox" 
                checked={agreeTos} 
                onChange={e => setAgreeTos(e.target.checked)}
                className="mt-1 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="tos" className="text-sm select-none cursor-pointer">
                I have read and agree to the{" "}
                <Link 
                  to="/legal?tab=terms" 
                  className="text-primary underline hover:no-underline font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Terms of Service
                </Link>
              </label>
            </div>
            
            <div className="flex items-start gap-3">
              <input 
                id="pp" 
                type="checkbox" 
                checked={agreePriv} 
                onChange={e => setAgreePriv(e.target.checked)}
                className="mt-1 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="pp" className="text-sm select-none cursor-pointer">
                I have read and agree to the{" "}
                <Link 
                  to="/legal?tab=privacy" 
                  className="text-primary underline hover:no-underline font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </Link>
              </label>
            </div>
          </div>

        </div>

        <div className="space-y-3">
          <Button 
            disabled={!agreeTos || !agreePriv || busy} 
            onClick={accept} 
            className="w-full h-12"
          >
            {busy ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Agree & Continue
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            onClick={() => nav("/legal")}
            className="w-full text-muted-foreground"
          >
            <FileText className="h-4 w-4 mr-2" />
            Read full policies
          </Button>
        </div>
      </div>
    </div>
  );
}