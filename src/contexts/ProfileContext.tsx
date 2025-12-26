import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDemoSession, isDemoMode } from "@/lib/demo";
import { normalizePhone } from "@/features/profile/ensureProfile";

interface Profile {
  id: string;
  full_name: string;
  phone: string;
  community: string;
  flat_no: string;
  building_id?: string | null;
  community_id?: string | null;
}

interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<Profile | null>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: true,
  error: null,
  refresh: async () => null,
});

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used within a ProfileProvider");
  return context;
};

interface ProfileProviderProps {
  children: React.ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (): Promise<Profile | null> => {
    try {
      // Demo/guest mode
      if (isDemoMode()) {
        const demoSession = getDemoSession();
        if (demoSession?.profile) {
          setProfile(demoSession.profile);
          setLoading(false);
          return demoSession.profile;
        }
      }

      // Firebase-only auth
      if (!user?.id) {
        setProfile(null);
        setLoading(false);
        return null;
      }

      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("id, full_name, phone, community, flat_no, building_id, community_id")
        .eq("firebase_uid", user.id)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message || "Failed to load profile");
        setProfile(null);
        setLoading(false);
        return null;
      }

      if (data) {
        setProfile(data);
        setLoading(false);
        return data;
      }

      // Create missing profile row (should be rare; VerifyOTP normally creates it)
      const phone = normalizePhone(user.phone ?? "");
      if (!phone) {
        setError("Missing phone number for profile");
        setProfile(null);
        setLoading(false);
        return null;
      }

      const { data: created, error: createErr } = await supabase
        .from("profiles")
        .insert({
          firebase_uid: user.id,
          phone,
          full_name: "User",
          community: "default",
          flat_no: "N/A",
        })
        .select("id, full_name, phone, community, flat_no, building_id, community_id")
        .single();

      if (createErr) {
        setError(createErr.message || "Failed to create profile");
        setProfile(null);
        setLoading(false);
        return null;
      }

      setProfile(created);
      setLoading(false);
      return created;
    } catch (e: any) {
      setError(e?.message || "An unexpected error occurred");
      setProfile(null);
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const refresh = async () => fetchProfile();

  return (
    <ProfileContext.Provider value={{ profile, loading, error, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}
