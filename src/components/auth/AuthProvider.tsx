import { createContext, useContext, useEffect, useState } from 'react';
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
    let sessionInitialized = false;

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

    // Check for demo mode first (initial load) — but do NOT return early
    if (isDemoMode()) {
      const demoSession = getDemoSession();
      if (demoSession) {
        setUser(demoSession.user as User);
        setSession(null); // Demo/guest mode doesn't use real sessions
        setLoading(false);
        sessionInitialized = true;
        // continue to set up Supabase listeners so real login can replace guest/demo
      }
    }

    // Set up auth state listener for real users FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state change:', event, session?.user?.id);
        
        // If we get a real auth session, clear any demo/guest sessions
        if (session?.user) {
          clearDemoSession();
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Only set loading to false after we've processed auth state
        if (!sessionInitialized) {
          setLoading(false);
          sessionInitialized = true;
        }
      }
    );

    // Get initial session for real users AFTER setting up listener
    const initializeSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
        }
        
        console.log('Initial session:', session?.user?.id);
        
        // If we have a real auth session, clear any demo/guest sessions
        if (session?.user) {
          clearDemoSession();
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Only set loading to false if we haven't already initialized
        if (!sessionInitialized) {
          setLoading(false);
          sessionInitialized = true;
        }
      } catch (error) {
        console.error('Error initializing session:', error);
        if (!sessionInitialized) {
          setLoading(false);
          sessionInitialized = true;
        }
      }
    };

    // Small delay to ensure proper initialization order
    const timer = setTimeout(initializeSession, 100);

    return () => {
      clearTimeout(timer);
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