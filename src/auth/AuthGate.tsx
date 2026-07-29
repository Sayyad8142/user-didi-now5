import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onFirebaseAuthStateChanged, getFirebaseAuth } from '@/lib/firebase';
import { isDemoMode, getDemoSession } from '@/lib/demo';

// Max time we'll wait for Firebase Auth to settle its initial state on the
// root path. On iOS WKWebView the Firebase Web SDK occasionally never fires
// the first onAuthStateChanged callback (IndexedDB persistence race). If we
// hit this timeout we DO NOT sign the user out or clear any session — we
// show a recoverable error UI with a Retry button. The 15s HTML splash
// fallback in index.html remains the final safety net.
const AUTH_STATE_TIMEOUT_MS = 5000;

type StartupError = { code: 'AUTH_INITIALIZATION_TIMEOUT'; message: string } | null;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<StartupError>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (ready && typeof window !== 'undefined' && (window as any).hideSplash) {
      console.info('[Startup] SPLASH_SCREEN_HIDDEN (AuthGate ready)');
      (window as any).hideSplash();
    }
  }, [ready]);

  // Also hide the native splash if we surface the recoverable error screen
  // so the user can actually see the Retry button.
  useEffect(() => {
    if (startupError && typeof window !== 'undefined' && (window as any).hideSplash) {
      (window as any).hideSplash();
    }
  }, [startupError]);

  useEffect(() => {
    console.info('[Startup] AUTH_CHECK_STARTED', { path: location.pathname, retryTick });
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
        try { unsubscribe(); } catch {}
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

    // Root path: use auth.authStateReady() (Firebase >= 9.16, supported by
    // our pinned firebase@11.10.0) races against a hard timeout. On timeout
    // we DO NOT clear the session — we surface a Retry screen instead.
    let cancelled = false;
    let settled = false;
    let timeoutId: number | undefined;

    const auth = getFirebaseAuth();
    const supportsAuthStateReady =
      !!auth && typeof (auth as any).authStateReady === 'function';
    console.info('[Startup] AUTH_STATE_READY_SUPPORTED', { supportsAuthStateReady });

    // Keep a passive listener alive for future auth changes (e.g. token
    // refresh, sign-out from another tab). We do NOT depend on its first
    // callback to open the app anymore.
    const unsubscribe = auth
      ? onFirebaseAuthStateChanged((user) => {
          if (cancelled) return;
          console.info('[Startup] AUTH_STATE_CHANGED', { hasUser: !!user });
        })
      : () => {};

    const openApp = (hasUser: boolean) => {
      if (cancelled || settled) return;
      settled = true;
      console.info('[Startup] AUTH_CHECK_COMPLETED', { hasUser });
      nav(hasUser ? '/home' : '/auth', { replace: true });
      setReady(true);
    };

    const readyPromise: Promise<void> = supportsAuthStateReady
      ? (auth as any).authStateReady()
      : new Promise<void>((resolve) => {
          // Fallback for older Firebase: resolve on first onAuthStateChanged.
          const off = onFirebaseAuthStateChanged(() => {
            try { off(); } catch {}
            resolve();
          });
        });

    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timeoutId = window.setTimeout(() => resolve('timeout'), AUTH_STATE_TIMEOUT_MS);
    });

    Promise.race([readyPromise.then(() => 'ready' as const), timeoutPromise])
      .then((outcome) => {
        if (cancelled || settled) return;
        if (outcome === 'ready') {
          const user = getFirebaseAuth()?.currentUser ?? null;
          openApp(!!user);
        } else {
          // Timeout — DO NOT sign out, DO NOT clear session. Show retry UI.
          console.warn('[Startup] AUTH_INITIALIZATION_TIMEOUT', {
            waitedMs: AUTH_STATE_TIMEOUT_MS,
            supportsAuthStateReady,
          });
          setStartupError({
            code: 'AUTH_INITIALIZATION_TIMEOUT',
            message: `Firebase did not settle within ${AUTH_STATE_TIMEOUT_MS}ms`,
          });
        }
      })
      .catch((err) => {
        if (cancelled || settled) return;
        console.error('[Startup] AUTH_CHECK_FAILED', err);
        setStartupError({
          code: 'AUTH_INITIALIZATION_TIMEOUT',
          message: err?.message || 'Auth initialization failed',
        });
      });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      try { unsubscribe(); } catch {}
    };
  }, [nav, location.pathname, retryTick]);

  const handleRetry = useCallback(() => {
    // Clear error and re-run the effect. The cleanup above tears down the
    // previous listener + timer, so no duplicates are created.
    setStartupError(null);
    setReady(false);
    setRetryTick((t) => t + 1);
  }, []);

  if (startupError) {
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #fbbf24 100%)',
        }}
      >
        <div
          style={{
            maxWidth: 360,
            width: '100%',
            background: '#ffffff',
            borderRadius: 16,
            padding: '24px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
            Taking longer than usual
          </div>
          <div style={{ fontSize: 14, color: '#4b5563', marginBottom: 20, lineHeight: 1.5 }}>
            We couldn't finish starting the app. Your session is safe — just tap Retry.
          </div>
          <button
            onClick={handleRetry}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: 'none',
              background: '#ec4899',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
          <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
            Ref: {startupError.code}
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
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
