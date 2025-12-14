import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { getDemoSession, isDemoMode } from '@/lib/demo';
import { auth as firebaseAuth } from '@/lib/firebase';

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
  const { user, firebaseUser } = useAuth();

  const fetchProfile = async (): Promise<Profile | null> => {
    try {
      // If no authenticated user, clear profile immediately
      if (!user?.id) {
        console.log('[ProfileContext] No user, clearing profile');
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

      // For Firebase auth, check if we have a current user
      if (!firebaseUser) {
        console.log('[ProfileContext] No Firebase user');
        setProfile(null);
        setLoading(false);
        return null;
      }

      setLoading(true);
      setError(null);

      console.log('[ProfileContext] Fetching profile for Firebase UID:', user.id);

      // Fetch profile using firebase_uid column (not the UUID id column)
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, firebase_uid, full_name, phone, community, flat_no, building_id, community_id')
        .eq('firebase_uid', user.id)
        .maybeSingle();

      if (!fetchError && data) {
        console.log('[ProfileContext] Profile found:', data.id);
        setProfile(data);
        setLoading(false);
        return data;
      }

      // Profile doesn't exist - create it
      if (fetchError?.code === 'PGRST116') {
        console.log('[ProfileContext] Profile not found, creating...');
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
        console.error('[ProfileContext] Fetch error:', fetchError);
        setError('Failed to load profile');
      }
      setLoading(false);
      return null;
    } catch (err) {
      console.error('[ProfileContext] Unexpected error:', err);
      setError('An unexpected error occurred');
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user?.id, firebaseUser?.uid]);

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged((fbUser) => {
      if (!fbUser) {
        console.log('[ProfileContext] Firebase user signed out, clearing profile');
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const refresh = async (): Promise<Profile | null> => {
    const freshProfile = await fetchProfile();
    return freshProfile;
  };

  return (
    <ProfileContext.Provider value={{ profile, loading, error, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}
