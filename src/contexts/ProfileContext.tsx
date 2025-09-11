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
}

interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: true,
  error: null,
  refresh: () => {},
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

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if we're in demo/guest mode first
      if (isDemoMode()) {
        const demoSession = getDemoSession();
        if (demoSession?.profile) {
          setProfile(demoSession.profile);
          setLoading(false);
          return;
        }
      }

      // If no authenticated user, clear profile
      if (!user?.id || !session) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Validate that user.id is a proper UUID (real Supabase user)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(user.id)) {
        console.log('User ID is not a valid UUID, treating as demo/guest user');
        setProfile(null);
        setLoading(false);
        return;
      }

      // Fetch real user profile from database
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, full_name, phone, community, flat_no')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        console.error('Error fetching profile:', fetchError);
        setError('Failed to load profile');
        return;
      }

      setProfile(data);
    } catch (err) {
      console.error('Error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user?.id, session]);

  const refresh = () => {
    fetchProfile();
  };

  return (
    <ProfileContext.Provider value={{ profile, loading, error, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}