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
      console.log('=== fetchProfile called ===');
      console.log('User:', user?.id);
      console.log('Session:', !!session);
      
      setLoading(true);
      setError(null);

      // Check if we're in demo/guest mode first
      if (isDemoMode()) {
        console.log('Demo mode detected');
        const demoSession = getDemoSession();
        if (demoSession?.profile) {
          setProfile(demoSession.profile);
          setLoading(false);
          return;
        }
      }

      // If no authenticated user, clear profile
      if (!user?.id || !session) {
        console.log('No user or session, clearing profile');
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

      console.log('Starting profile fetch for user:', user.id);

      // Wait a bit for session to stabilize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Always try to ensure profile exists first
      try {
        console.log('Importing ensureProfile...');
        const { ensureProfile } = await import('@/features/profile/ensureProfile');
        console.log('Calling ensureProfile...');
        const profileData = await ensureProfile();
        console.log('Profile ensured successfully:', profileData);
        
        if (profileData) {
          setProfile(profileData);
          console.log('Profile set successfully');
          return; // Success - we're done
        } else {
          console.log('No profile data returned from ensureProfile');
          // Continue to fallback
        }
      } catch (profileError) {
        console.error('Error ensuring profile:', profileError);
        // Continue to fallback
      }

      // Fallback: try to fetch existing profile directly
      console.log('Trying fallback profile fetch...');
      try {
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

        if (data) {
          console.log('Fallback profile fetch successful:', data);
          setProfile(data);
        } else {
          console.log('No profile data found');
          setError('No profile data found');
        }
      } catch (fallbackError) {
        console.error('Fallback profile fetch failed:', fallbackError);
        setError('Failed to load profile data');
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
      console.log('=== fetchProfile completed ===');
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user?.id, session]);

  // Listen for auth state changes to refresh profile after login
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (event === 'SIGNED_IN' && session?.user) {
        // Force a profile refresh immediately on sign in
        setLoading(true);
        // Add a longer delay to ensure session is fully established
        setTimeout(() => {
          console.log('Triggering profile fetch after sign in');
          fetchProfile();
        }, 1000);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refresh = () => {
    fetchProfile();
  };

  return (
    <ProfileContext.Provider value={{ profile, loading, error, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}