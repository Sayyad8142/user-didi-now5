import { useEffect, useState, ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { 
        mounted && setOk(false); 
        mounted && setLoading(false); 
        return; 
      }
      
      // Allow if profile.is_admin OR phone is whitelisted
      let allow = false;
      const phone = (user.phone || user.user_metadata?.phone_number || "").toString();
      if (normalizePhone(phone) === normalizePhone(ADMIN_PHONE)) allow = true;
      
      try {
        const { data: prof } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
        if (prof?.is_admin) allow = true;
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