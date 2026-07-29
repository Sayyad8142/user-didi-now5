import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onFirebaseAuthStateChanged } from '@/lib/firebase';
import { isDemoMode, getDemoSession } from '@/lib/demo';

// Max time we'll wait for Firebase Auth to report its initial state on the
// root path before assuming "signed out" and routing to /auth. On iOS
// WKWebView the Firebase Web SDK occasionally never fires the first
// onAuthStateChanged callback (IndexedDB persistence race), which used to
// leave the app stuck on the pink splash forever. 5s is well beyond the
// typical <100ms fire time on healthy startups.
const AUTH_STATE_TIMEOUT_MS = 5000;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready && typeof window !== 'undefined' && (window as any).hideSplash) {
      console.info('[Startup] SPLASH_SCREEN_HIDDEN (AuthGate ready)');
      (window as any).hideSplash();
    }
  }, [ready]);

  useEffect(() => {
    console.info('[Startup] AUTH_CHECK_STARTED', { path: location.pathname });
    const authEntryRoutes = ['/auth', '/auth/verify'];

    if (authEntryRoutes.some((r) => location.pathname.startsWith(r))) {
      setReady(true);

      // Demo/guest users are allowed to reach the auth page
      if (isDemoMode()) return;

      let cancelled = false;
      const unsubscribe = onFirebaseAuthStateChanged((user) => {
        if (cancelled) return;
        if (!user) return;
        nav('/home', { replace: true });
      });
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    // Allow legal/public routes immediately
    const publicRoutes = ['/legal', '/legal/privacy', '/legal/terms'];
    if (publicRoutes.some((r) => location.pathname.startsWith(r))) {
      setReady(true);
      return;
    }

    // Non-root paths: show content immediately, let ProtectedRoute handle auth
    if (location.pathname !== '/') {
      setReady(true);
      return;
    }

    // Demo first
    if (isDemoMode()) {
      const demoSession = getDemoSession();
      if (demoSession) {
        nav('/home', { replace: true });
        setReady(true);
        return;
      }
    }

    // Root path: wait for Firebase Web SDK auth state, but with a hard
    // timeout so iOS can't hang here forever if the SDK's initial
    // onAuthStateChanged never fires.
    let cancelled = false;
    let settled = false;

    const settleAsSignedOut = (reason: string) => {
      if (settled || cancelled) return;
      settled = true;
      console.warn('[Startup] AUTH_CHECK_COMPLETED (fallback → signed-out):', reason);
      nav('/auth', { replace: true });
      setReady(true);
    };

    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      if (cancelled || settled) return;
      settled = true;
      console.info('[Startup] AUTH_CHECK_COMPLETED', { hasUser: !!user });
      nav(user ? '/home' : '/auth', { replace: true });
      setReady(true);
    });

    const timeoutId = window.setTimeout(
      () => settleAsSignedOut(`no initial auth state within ${AUTH_STATE_TIMEOUT_MS}ms`),
      AUTH_STATE_TIMEOUT_MS,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      try { unsubscribe(); } catch {}
    };
  }, [nav, location.pathname]);

  if (!ready) {
    // Render a real loader instead of null so the user always sees progress
    // — the HTML #app-splash stays visible on top until we call hideSplash().
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #fbbf24 100%)',
        }}
        aria-hidden
      />
    );
  }
  return <>{children}</>;
}
