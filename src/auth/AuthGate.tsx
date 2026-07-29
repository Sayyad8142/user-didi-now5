import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onFirebaseAuthStateChanged, getFirebaseAuth } from '@/lib/firebase';
import { isDemoMode, getDemoSession } from '@/lib/demo';

// Max time we'll wait for Firebase Auth to emit its initial listener callback
// on the root path. On timeout we DO NOT sign out, clear storage, delete any
// persisted session, or navigate to /auth. We only show a recoverable screen;
// Retry performs a full JavaScript restart.
const AUTH_STATE_TIMEOUT_MS = 5000;

type StartupError = { code: 'AUTH_INITIALIZATION_TIMEOUT' | 'AUTH_LISTENER_ERROR'; message: string } | null;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<StartupError>(null);

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
    console.info('[Startup] AUTH_CHECK_STARTED', { path: location.pathname });
    const authEntryRoutes = ['/auth', '/auth/verify'];

    if (authEntryRoutes.some((r) => location.pathname.startsWith(r))) {
      setReady(true);

      // Demo/guest users are allowed to reach the auth page
      if (isDemoMode()) return;

      let cancelled = false;
      const unsubscribe = onFirebaseAuthStateChanged((user) => {
        if (cancelled) return;
        console.info('[Startup] AUTH_LISTENER_CALLBACK', {
          path: location.pathname,
          hasUser: !!user,
        });
        if (!user) return;
        nav('/home', { replace: true });
      }, (error) => {
        if (cancelled) return;
        console.error('[Startup] AUTH_LISTENER_ERROR', {
          message: error?.message,
          code: (error as any)?.code,
          stack: error?.stack,
        });
      });
      console.info('[Startup] AUTH_LISTENER_ATTACHED', { path: location.pathname });
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

    // Root path: open the app from the first onAuthStateChanged callback.
    // authStateReady() is started only as diagnostic/secondary visibility — it
    // is not the only path that can open the app, because it can hang on iOS.
    let cancelled = false;
    let settled = false;
    let timeoutId: number | undefined;

    const auth = getFirebaseAuth();
    const supportsAuthStateReady =
      !!auth && typeof (auth as any).authStateReady === 'function';
    console.info('[Startup] AUTH_STATE_READY_SUPPORTED', { supportsAuthStateReady });

    const openApp = (hasUser: boolean, source: 'listener' | 'authStateReady') => {
      if (cancelled || settled) return;
      settled = true;
      console.info('[Startup] AUTH_CHECK_COMPLETED', { hasUser, source });
      nav(hasUser ? '/home' : '/auth', { replace: true });
      setReady(true);
    };

    const showListenerError = (err: any) => {
      if (cancelled || settled) return;
      console.error('[Startup] AUTH_LISTENER_ERROR', {
        message: err?.message,
        code: err?.code,
        stack: err?.stack,
      });
      settled = true;
      setStartupError({
        code: 'AUTH_LISTENER_ERROR',
        message: err?.message || 'Authentication listener failed',
      });
    };

    const unsubscribe = auth
      ? onFirebaseAuthStateChanged((user) => {
          if (cancelled) return;
          console.info('[Startup] AUTH_LISTENER_CALLBACK', { hasUser: !!user });
          openApp(!!user, 'listener');
        }, showListenerError)
      : () => {};
    console.info('[Startup] AUTH_LISTENER_ATTACHED', { path: location.pathname });

    if (supportsAuthStateReady) {
      console.info('[Startup] AUTH_STATE_READY_STARTED');
      (auth as any).authStateReady()
        .then(() => {
          if (cancelled) return;
          const user = getFirebaseAuth()?.currentUser ?? null;
          console.info('[Startup] AUTH_STATE_READY_RESOLVED', { hasUser: !!user });
          openApp(!!user, 'authStateReady');
        })
        .catch((err: any) => {
          if (cancelled) return;
          console.error('[Startup] AUTH_STATE_READY_REJECTED', {
            message: err?.message,
            code: err?.code,
            stack: err?.stack,
          });
          showListenerError(err);
        });
    }

    timeoutId = window.setTimeout(() => {
      if (cancelled || settled) return;
      // Timeout — DO NOT sign out, clear session, delete storage, or route to /auth.
      console.warn('[Startup] AUTH_INITIALIZATION_TIMEOUT', {
        waitedMs: AUTH_STATE_TIMEOUT_MS,
        supportsAuthStateReady,
      });
      settled = true;
      setStartupError({
        code: 'AUTH_INITIALIZATION_TIMEOUT',
        message: `Firebase did not emit auth state within ${AUTH_STATE_TIMEOUT_MS}ms`,
      });
    }, AUTH_STATE_TIMEOUT_MS);

    if (!auth) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
      console.error('[Startup] AUTH_LISTENER_ERROR', {
        message: 'Firebase Auth not initialized',
      });
      settled = true;
      setStartupError({
        code: 'AUTH_LISTENER_ERROR',
        message: 'Firebase Auth not initialized',
      });
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      try { unsubscribe(); } catch {}
    };
  }, [nav, location.pathname]);

  const handleRetry = useCallback(() => {
    window.location.reload();
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
