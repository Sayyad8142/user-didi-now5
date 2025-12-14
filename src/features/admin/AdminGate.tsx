import { useEffect, useState, ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { auth as firebaseAuth } from "@/lib/firebase";
import { normalizePhone } from "@/features/profile/ensureProfile";

const ADMIN_PHONE = (import.meta.env.VITE_ADMIN_PHONE || "+919000666986").replace(/\s/g,"");

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  community?: string | null;
  flat_no?: string | null;
};

export function AdminGate({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const user = firebaseAuth.currentUser;
      if (!user) { 
        mounted && setOk(false); 
        mounted && setLoading(false); 
        return; 
      }
      
      // Server-side verification only - check if user is admin
      let allow = false;
      const phone = (user.phoneNumber || "").toString();
      
      // Check if phone is whitelisted
      if (normalizePhone(phone) === normalizePhone(ADMIN_PHONE)) {
        allow = true;
      }
      
      // Check database for is_admin flag
      try {
        const { data: prof } = await supabase.from("profiles").select("is_admin").eq("firebase_uid", user.uid).maybeSingle();
        if (prof?.is_admin) {
          allow = true;
        }
      } catch {}
      
      mounted && setOk(allow); 
      mounted && setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return null;
  if (!ok) return (
    <div className="min-h-dvh grid place-items-center p-4">
      <div className="bg-white p-5 rounded-xl shadow">Not authorized</div>
    </div>
  );
  return <>{children}</>;
}