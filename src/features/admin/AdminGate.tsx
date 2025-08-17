import { useEffect, useState, ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "team@didisnow.com").toLowerCase();

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  community?: string | null;
  flat_no?: string | null;
  is_admin?: boolean;
};

export function AdminGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;

        if (!user) {
          setAuthorized(false);
          setLoading(false);
          return;
        }

        // Check if email matches admin email
        const emailOk = (user.email || "").toLowerCase() === ADMIN_EMAIL;

        // Also check is_admin flag from profile
        let profileOk = false;
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .maybeSingle();
        
        profileOk = !!profile?.is_admin;

        if (!active) return;
        setAuthorized(emailOk || profileOk);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError("Failed to verify admin access");
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Loading UI
  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-pink-50 shadow-lg p-6">
          <div className="h-6 w-32 bg-pink-100 animate-pulse rounded mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-3/4 bg-gray-100 animate-pulse rounded" />
            <div className="h-4 w-1/2 bg-gray-100 animate-pulse rounded" />
          </div>
        </div>
      </div>
    );
  }

  // Not logged in → redirect to admin email login
  if (!authorized && !error) {
    return <Navigate to="/admin-login-email" replace state={{ redirectTo: location.pathname }} />;
  }

  // Error or not authorized
  if (error || !authorized) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow p-6 text-center space-y-2">
          <div className="text-lg font-semibold">Not Authorized</div>
          <div className="text-sm text-gray-600">{error || "Use the admin email to login."}</div>
          <Link to="/admin-login-email" className="mt-4 inline-flex items-center justify-center h-11 px-4 rounded-full bg-[#ff007a] text-white">
            Admin Login
          </Link>
        </div>
      </div>
    );
  }

  // Authorized → show admin
  return <>{children}</>;
}