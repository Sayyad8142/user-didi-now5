import { useEffect, useMemo, useState, ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  community?: string | null;
  flat_no?: string | null;
};

function normalizePhone(raw?: string | null) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return raw;
}

function useAdminWhitelist() {
  const env = import.meta.env.VITE_ADMIN_PHONES ?? "+919000666986";
  return useMemo(() => {
    const set = new Set<string>();
    env.split(",").map(s => s.trim()).filter(Boolean).forEach(p => set.add(normalizePhone(p)));
    return set;
  }, [env]);
}

export function AdminGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const whitelist = useAdminWhitelist();

  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1) Read current auth user
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUserId(data.user?.id ?? null);
      setAuthLoading(false);
    })();
    return () => { active = false; };
  }, []);

  // 2) Fetch OR CREATE profile for that user
  useEffect(() => {
    let active = true;
    (async () => {
      if (!userId) { setLoading(false); return; }

      // read auth user/phone for seed
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;
      const authPhone =
        authUser?.phone ??
        (authUser?.user_metadata as any)?.phone_number ??
        (authUser?.user_metadata as any)?.phone ??
        null;

      // Try fetch (no error if missing)
      const { data: existing, error: readErr } = await supabase
        .from("profiles")
        .select("id, full_name, phone, community, flat_no")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;

      if (readErr) {
        setError("Failed to load profile");
        setLoading(false);
        return;
      }

      if (!existing) {
        // Create minimal profile
        const { data: created, error: upErr } = await supabase
          .from("profiles")
          .upsert(
            {
              id: userId,
              full_name: authPhone ?? "User",
              phone: authPhone,
              community: null,
              flat_no: null,
            },
            { onConflict: "id" }
          )
          .select("id, full_name, phone, community, flat_no")
          .single();

        if (upErr) {
          setError("Failed to create profile");
          setLoading(false);
          return;
        }
        setProfile(created as Profile);
        setLoading(false);
        return;
      }

      setProfile(existing as Profile);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId]);

  // Loading UI
  if (authLoading || loading) {
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

  // Not logged in → to /auth (keep redirect)
  if (!userId) {
    return <Navigate to="/auth" replace state={{ redirectTo: location.pathname }} />;
  }

  // Profile failure
  if (error || !profile) {
    return (
      <div className="min-h-dvh grid place-items-center bg-gradient-to-b from-pink-50 to-pink-100 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-rose-200 shadow-lg p-6 text-center">
          <div className="text-rose-500 text-3xl mb-2">⚠️</div>
          <h2 className="text-lg font-semibold">Access Error</h2>
          <p className="text-sm text-gray-600 mt-2">{error || "Unable to verify admin access"}</p>
          <Link to="/home" className="mt-4 inline-flex items-center justify-center h-11 px-4 rounded-full bg-[#ff007a] text-white">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  // 3) Whitelist check
  const ok = whitelist.has(normalizePhone(profile.phone));
  if (!ok) {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-pink-50 shadow-lg p-6 text-center">
          <h2 className="text-lg font-semibold">Not Authorized</h2>
          <p className="text-sm text-gray-600 mt-1">You don't have permission to access the admin console.</p>
          <p className="text-xs text-gray-500 mt-1">Phone: {profile.phone ?? "—"}</p>
          <Link to="/home" className="mt-4 inline-flex items-center justify-center h-11 px-4 rounded-full bg-gray-900 text-white">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  // Authorized → show admin
  return <>{children}</>;
}