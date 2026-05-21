import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDemoSession, isDemoMode, clearDemoSession } from "@/lib/demo";
import { normalizePhone } from "@/features/profile/ensureProfile";
import { bootstrapProfileViaEdge } from "@/lib/profileBootstrap";

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
  /** True only after a successful bootstrap/refresh has completed for the current user. */
  isProfileReady: boolean;
  error: string | null;
  refresh: () => Promise<Profile | null>;
  bootstrapProfile: (authUser: { id: string; phone?: string | null }) => Promise<Profile | null>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: true,
  isProfileReady: false,
  error: null,
  refresh: async () => null,
  bootstrapProfile: async () => null,
});

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used within a ProfileProvider");
  return context;
};

interface ProfileProviderProps {
  children: React.ReactNode;
}

const PROFILE_CACHE_KEY = 'didi.profile.cache.v1';

/** A cached profile is considered "useful" only when key fields are populated. */
function isProfileComplete(p: Profile | null | undefined): boolean {
  if (!p || !p.id) return false;
  const hasName = !!(p.full_name && p.full_name.trim() && p.full_name !== 'User');
  const hasPhone = !!(p.phone && p.phone.trim());
  const hasCommunity = !!(p.community_id || (p.community && p.community.trim()));
  const hasFlat = !!(p.flat_id || (p.flat_no && p.flat_no.trim()));
  return hasName && hasPhone && hasCommunity && hasFlat;
}

const tlog = (...args: any[]) => {
  try {
    console.log(`[ProfileBootstrap] ${new Date().toISOString()}`, ...args);
  } catch {}
};

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { user, firebaseUser } = useAuth();
  const queryClient = useQueryClient();

  const readCachedProfile = (): Profile | null => {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      return raw ? (JSON.parse(raw) as Profile) : null;
    } catch { return null; }
  };

  const initialCached = typeof window !== 'undefined' ? readCachedProfile() : null;
  const initialComplete = isProfileComplete(initialCached);
  const [profile, setProfile] = useState<Profile | null>(initialCached);
  // Loading is true unless we have a *complete* cached profile to render immediately.
  const [loading, setLoading] = useState(!initialComplete);
  const [isProfileReady, setIsProfileReady] = useState(initialComplete);
  const [error, setError] = useState<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInvalidatedForRef = useRef<string | null>(null);

  // In-flight bootstrap promise dedup, keyed by user id
  const inFlightRef = useRef<{ key: string; promise: Promise<Profile | null> } | null>(null);

  if (initialCached) tlog('cache.read', { complete: initialComplete, hasName: !!initialCached.full_name });

  const _doLoad = useCallback(async (activeUser: { id: string; phone?: string | null }): Promise<Profile | null> => {
    const startedAt = performance.now();
    tlog('bootstrap.start', { uid: activeUser.id });
    try {
      const phone = normalizePhone(activeUser.phone ?? "");
      const { mark } = await import('@/lib/perfMarks');
      mark('profile.bootstrap.start');
      // CRITICAL: pass mode='signin' so this auto-bootstrap (fired on Firebase
      // auth-state change) can NEVER create a stub profile. Profile creation
      // must happen exclusively via the explicit signup flow in VerifyOTP,
      // which passes mode='signup' with signupData (fullName, community, flat).
      // Without this, a race between this listener and VerifyOTP's signup
      // call produced stub profiles named "+91XXXXXXXXXX" which the booking
      // layer then renders as "User <last4>" in the admin panel.
      const created = await bootstrapProfileViaEdge({ phone, mode: 'signin' });
      mark('profile.bootstrap.done');
      tlog('bootstrap.done', { uid: activeUser.id, ms: Math.round(performance.now() - startedAt), name: created.full_name });
      setProfile(created as any);
      try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(created)); } catch {}
      setIsProfileReady(true);
      setLoading(false);
      setError(null);
      return created as any;
    } catch (bootstrapErr: any) {
      // account_not_found is expected during signup (before the explicit
      // signup call in VerifyOTP has created the profile). Don't surface an
      // error — just leave profile empty so signup can complete.
      const isAccountNotFound = bootstrapErr?.code === 'account_not_found';
      tlog('bootstrap.error', { uid: activeUser.id, error: bootstrapErr?.message, code: bootstrapErr?.code });
      const cached = readCachedProfile();
      if (cached && !isAccountNotFound) {
        setProfile(cached);
        if (isProfileComplete(cached)) {
          setIsProfileReady(true);
          setLoading(false);
        } else {
          setLoading(true);
        }
        return cached;
      }
      if (!isAccountNotFound) {
        setError(bootstrapErr?.message || "Failed to load profile");
      }
      setProfile(null);
      setIsProfileReady(false);
      setLoading(false);
      return null;
    }
  }, []);

  const loadProfileForAuth = useCallback(async (authUser?: { id: string; phone?: string | null }): Promise<Profile | null> => {
    try {
      const activeUser = authUser?.id
        ? authUser
        : user?.id
          ? { id: user.id, phone: user.phone ?? null }
          : null;

      // If we have a real Firebase user, always clear demo/guest mode first
      if (firebaseUser || activeUser?.id) {
        clearDemoSession();
      }

      // Demo/guest mode handling (only when no real user)
      if (!firebaseUser && !activeUser?.id && isDemoMode()) {
        const demoSession = getDemoSession();
        if (demoSession?.profile) {
          setProfile(demoSession.profile);
          setIsProfileReady(true);
          setLoading(false);
          return demoSession.profile;
        }
      }

      if (!activeUser?.id) {
        setProfile(null);
        setIsProfileReady(false);
        setLoading(false);
        return null;
      }

      // Dedup concurrent calls for the same user
      if (inFlightRef.current && inFlightRef.current.key === activeUser.id) {
        tlog('bootstrap.dedup', { uid: activeUser.id });
        return inFlightRef.current.promise;
      }

      // Loading: only show spinner if cached profile is incomplete or absent.
      const cached = readCachedProfile();
      if (!isProfileComplete(cached)) {
        setLoading(true);
      }
      setError(null);

      const promise = _doLoad(activeUser).finally(() => {
        if (inFlightRef.current?.key === activeUser.id) inFlightRef.current = null;
      });
      inFlightRef.current = { key: activeUser.id, promise };
      return promise;
    } catch (e: any) {
      tlog('bootstrap.unexpected_error', { error: e?.message });
      setError(e?.message || "An unexpected error occurred");
      setProfile(null);
      setIsProfileReady(false);
      setLoading(false);
      return null;
    }
  }, [user?.id, user?.phone, firebaseUser, _doLoad]);

  const fetchProfile = useCallback(() => loadProfileForAuth(), [loadProfileForAuth]);
  const bootstrapProfile = useCallback(
    (authUser: { id: string; phone?: string | null }) => loadProfileForAuth(authUser),
    [loadProfileForAuth]
  );

  // Primary effect: fetch when auth state changes
  useEffect(() => {
    fetchProfile().then((result) => {
      if (user?.id && !result) {
        tlog('schedule_retry');
        retryTimerRef.current = setTimeout(() => fetchProfile(), 2000);
      }
    });

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [fetchProfile]);

  // Re-fetch when app resumes from background — guarded by 60s TTL
  const lastProfileFetchRef = useRef<number>(0);
  useEffect(() => {
    if (profile?.id) lastProfileFetchRef.current = Date.now();
  }, [profile?.id]);

  useEffect(() => {
    const REFETCH_TTL = 60_000;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !user?.id) return;
      const sinceLast = Date.now() - lastProfileFetchRef.current;
      if (sinceLast < REFETCH_TTL) return;
      tlog('resume.refresh', { sinceLast });
      fetchProfile();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchProfile, user?.id]);

  useEffect(() => {
    const handleDemoModeChange = () => { fetchProfile(); };
    window.addEventListener('demo-mode-changed', handleDemoModeChange);
    return () => window.removeEventListener('demo-mode-changed', handleDemoModeChange);
  }, [fetchProfile]);

  useEffect(() => {
    const handleNativeAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string; phoneNumber?: string | null }>).detail;
      if (!detail?.uid) return;
      tlog('native-auth-changed', { uid: detail.uid });
      bootstrapProfile({ id: detail.uid, phone: detail.phoneNumber ?? null });
    };
    window.addEventListener('native-auth-changed', handleNativeAuthChanged as EventListener);
    return () => window.removeEventListener('native-auth-changed', handleNativeAuthChanged as EventListener);
  }, [bootstrapProfile]);

  useEffect(() => {
    const handleBackendReady = () => {
      if (user?.id && !profile) {
        tlog('supabase-ready.fetch');
        fetchProfile();
      }
    };
    window.addEventListener('supabase-ready', handleBackendReady);
    return () => window.removeEventListener('supabase-ready', handleBackendReady);
  }, [fetchProfile, user?.id, profile]);

  // When a fresh profile.id becomes available, invalidate user-scoped queries that
  // depend on it — but DO NOT invalidate wallet-balance (it has its own realtime
  // refresh and refetchOnMount). Avoid forcing an extra wallet refetch.
  useEffect(() => {
    const pid = profile?.id;
    if (!pid) return;
    if (lastInvalidatedForRef.current === pid) return;
    lastInvalidatedForRef.current = pid;
    tlog('profile.ready.invalidate_queries', { pid });
    queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['active-booking'] });
    queryClient.invalidateQueries({ queryKey: ['favorite-workers'] });
    queryClient.invalidateQueries({ queryKey: ['online-worker-counts'] });
  }, [profile?.id, queryClient]);

  const refresh = async () => fetchProfile();

  return (
    <ProfileContext.Provider value={{ profile, loading, isProfileReady, error, refresh, bootstrapProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}
