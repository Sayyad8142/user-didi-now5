import { useEffect, useState, ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
      // Check for existing valid admin session first
      const adminLoginTime = localStorage.getItem('admin_login_time');
      const adminPhone = localStorage.getItem('admin_phone');
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      
      // If admin logged in within last 7 days, allow access without re-verification
      if (adminLoginTime && adminPhone && (now - parseInt(adminLoginTime)) < sevenDaysMs) {
        if (normalizePhone(adminPhone) === normalizePhone(ADMIN_PHONE)) {
          mounted && setOk(true);
          mounted && setLoading(false);
          return;
        }
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { 
        mounted && setOk(false); 
        mounted && setLoading(false); 
        return; 
      }
      
      // Allow if profile.is_admin OR phone is whitelisted
      let allow = false;
      const phone = (user.phone || user.user_metadata?.phone_number || "").toString();
      if (normalizePhone(phone) === normalizePhone(ADMIN_PHONE)) {
        allow = true;
        // Update admin login timestamp
        localStorage.setItem('admin_login_time', now.toString());
        localStorage.setItem('admin_phone', normalizePhone(phone));
      }
      
      try {
        const { data: prof } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
        if (prof?.is_admin) {
          allow = true;
          // Update admin login timestamp
          localStorage.setItem('admin_login_time', now.toString());
          localStorage.setItem('admin_phone', normalizePhone(phone));
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