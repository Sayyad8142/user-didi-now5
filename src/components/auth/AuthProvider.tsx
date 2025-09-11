import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getDemoSession, isDemoMode, clearDemoSession } from '@/lib/demo';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for demo mode changes (triggered by setDemoSession/clearDemoSession)
    const handleDemoModeChange = (_event: Event) => {
      const demo = getDemoSession();
      if (demo) {
        setUser(demo.user as User);
        setSession(null);
        setLoading(false);
      } else {
        setUser(null);
        setSession(null);
      }
    };
    window.addEventListener('demo-mode-changed', handleDemoModeChange as EventListener);

    // Check for demo mode first (initial load)
    if (isDemoMode()) {
      const demoSession = getDemoSession();
      if (demoSession) {
        setUser(demoSession.user as User);
        setSession(null); // Demo mode doesn't use real sessions
        setLoading(false);
        return () => {
          window.removeEventListener('demo-mode-changed', handleDemoModeChange as EventListener);
        };
      }
    }

    // Set up auth state listener for real users
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // If we get a real auth session, clear any demo/guest sessions
        if (session?.user) {
          clearDemoSession();
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Get initial session for real users
    supabase.auth.getSession().then(({ data: { session } }) => {
      // If we have a real auth session, clear any demo/guest sessions
      if (session?.user) {
        clearDemoSession();
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('demo-mode-changed', handleDemoModeChange as EventListener);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}