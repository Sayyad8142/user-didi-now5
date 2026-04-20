import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDemoSession, isDemoMode, clearDemoSession } from "@/lib/demo";
import { normalizePhone } from "@/features/profile/ensureProfile";

interface Profile {
  id: string;
  full_name: string;
  phone: string;
  community: string;
  flat_no: string;
  building_id?: string | null;
  community_id?: string | null;
  flat_id?: string | null;
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
  const { user, firebaseUser } = useAuth();
  const queryClient = useQueryClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInvalidatedForRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (): Promise<Profile | null> => {
    try {
      // IMPORTANT: If we have a real Firebase user, always clear demo/guest mode first
      if (firebaseUser) {
        clearDemoSession();
      }

      // Only check demo/guest mode if we DON'T have a real Firebase user
      if (!firebaseUser && isDemoMode()) {
        const demoSession = getDemoSession();
        if (demoSession?.profile) {
          setProfile(demoSession.profile);
          setLoading(false);
          return demoSession.profile;
        }
      }

      // Firebase-only auth - need a real user to fetch profile
      if (!user?.id) {
        setProfile(null);
        setLoading(false);
        return null;
      }

      setLoading(true);
      setError(null);

      console.log('🔍 Fetching profile for firebase_uid:', user.id);

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id")
        .eq("firebase_uid", user.id)
        .maybeSingle();

      if (fetchError) {
        console.error('❌ Profile fetch error:', fetchError);
        setError(fetchError.message || "Failed to load profile");
        setProfile(null);
        setLoading(false);
        return null;
      }

      if (data) {
        console.log('✅ Profile loaded:', data.id, data.full_name);
        setProfile(data);
        setLoading(false);
        return data;
      }

      // No profile found - retry several times before falling back.
      // On first APK login the profile row is being inserted in parallel by
      // VerifyOTP.ensureFirebaseProfile — give it enough time on slow networks
      // before we create a generic fallback row.
      console.log('📝 No profile found for:', user.id, '- retrying...');

      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 600));
        const { data: retryData } = await supabase
          .from("profiles")
          .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id")
          .eq("firebase_uid", user.id)
          .maybeSingle();

        if (retryData) {
          console.log(`✅ Profile found on retry #${attempt + 1}:`, retryData.id, retryData.full_name);
          setProfile(retryData);
          setLoading(false);
          return retryData;
        }
      }

      // After retries, create a basic profile as last resort
      console.log('📝 Creating fallback profile for:', user.id);
      const phone = normalizePhone(user.phone ?? "");
      
      const { data: created, error: createErr } = await supabase
        .from("profiles")
        .insert({
          firebase_uid: user.id,
          phone: phone || "",
          full_name: phone || "User",
          community: "other",
          flat_no: "",
        })
        .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id")
        .single();

      if (createErr) {
        if (createErr.code === '23505') {
          const { data: finalData } = await supabase
            .from("profiles")
            .select("id, full_name, phone, community, flat_no, building_id, community_id, flat_id")
            .eq("firebase_uid", user.id)
            .maybeSingle();
          if (finalData) {
            setProfile(finalData);
            setLoading(false);
            return finalData;
          }
        }
        console.error('❌ Profile create error:', createErr);
        setError(createErr.message || "Failed to create profile");
        setProfile(null);
        setLoading(false);
        return null;
      }

      console.log('✅ Profile created:', created.id);
      setProfile(created);
      setLoading(false);
      return created;
    } catch (e: any) {
      console.error('❌ Unexpected error in fetchProfile:', e);
      setError(e?.message || "An unexpected error occurred");
      setProfile(null);
      setLoading(false);
      return null;
    }
  }, [user?.id, user?.phone, firebaseUser]);

  // Primary effect: fetch when auth state changes
  useEffect(() => {
    fetchProfile().then((result) => {
      // If user is authenticated but profile fetch returned null (backend not ready yet),
      // schedule a retry after a short delay
      if (user?.id && !result) {
        console.log('🔄 Profile: scheduling retry (backend may not be ready)');
        retryTimerRef.current = setTimeout(() => {
          fetchProfile();
        }, 2000);
      }
    });

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [fetchProfile]);

  // Re-fetch when app resumes from background (handles both native + web)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && user?.id) {
        console.log('🔄 Profile: app resumed, refreshing');
        fetchProfile();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchProfile, user?.id]);

  // Listen for demo mode changes
  useEffect(() => {
    const handleDemoModeChange = () => {
      fetchProfile();
    };
    window.addEventListener('demo-mode-changed', handleDemoModeChange);
    return () => window.removeEventListener('demo-mode-changed', handleDemoModeChange);
  }, [fetchProfile]);

  // Listen for backend-ready event (fired after initSupabase completes)
  useEffect(() => {
    const handleBackendReady = () => {
      if (user?.id && !profile) {
        console.log('🔄 Profile: backend ready, fetching now');
        fetchProfile();
      }
    };
    window.addEventListener('supabase-ready', handleBackendReady);
    return () => window.removeEventListener('supabase-ready', handleBackendReady);
  }, [fetchProfile, user?.id, profile]);

  const refresh = async () => fetchProfile();

  return (
    <ProfileContext.Provider value={{ profile, loading, error, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}
