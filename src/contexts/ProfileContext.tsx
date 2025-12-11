import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { getDemoSession, isDemoMode } from '@/lib/demo';

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
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};

interface ProfileProviderProps {
  children: React.ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, session } = useAuth();

  const fetchProfile = async (): Promise<Profile | null> => {
    try {
      // If no authenticated user, clear profile immediately
      if (!user?.id || !session) {
        setProfile(null);
        setLoading(false);
        return null;
      }

      // Check if we're in demo/guest mode
      if (isDemoMode()) {
        const demoSession = getDemoSession();
        if (demoSession?.profile) {
          setProfile(demoSession.profile);
          setLoading(false);
          return demoSession.profile;
        }
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(user.id)) {
        setProfile(null);
        setLoading(false);
        return null;
      }

      setLoading(true);
      setError(null);

      // Direct fetch - faster than dynamic import
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, full_name, phone, community, flat_no, building_id, community_id')
        .eq('id', user.id)
        .single();

      if (!fetchError && data) {
        setProfile(data);
        setLoading(false);
        return data;
      }

      // Profile doesn't exist - create it (only on first signup)
      if (fetchError?.code === 'PGRST116') {
        const { ensureProfile } = await import('@/features/profile/ensureProfile');
        const profileData = await ensureProfile();
        if (profileData) {
          setProfile(profileData);
          setLoading(false);
          return profileData;
        }
      }

      // Handle other errors
      if (fetchError) {
        setError('Failed to load profile');
      }
      setLoading(false);
      return null;
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user?.id]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    await fetchProfile();
  };

  return (
    <ProfileContext.Provider value={{ profile, loading, error, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}