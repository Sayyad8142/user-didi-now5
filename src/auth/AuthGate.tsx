import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onFirebaseAuthStateChanged, getFirebaseAuth } from '@/lib/firebase';
import { isDemoMode, getDemoSession } from '@/lib/demo';

// Max time we'll block the root route while Firebase restores persisted auth.
// iOS WKWebView can occasionally delay this callback. A delay is not a fatal
// auth error: after this window we open the best-known route and leave the
// listener alive so a restored session can still move the user to /home.
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

    const openApp = (
      hasUser: boolean,
      source: 'listener' | 'authStateReady' | 'timeout' | 'listenerError',
    ) => {
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
      // A listener failure must not trap the user on a retry loop. Route from
      // the current snapshot and let AuthProvider continue owning auth state.
      openApp(!!getFirebaseAuth()?.currentUser, 'listenerError');
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
      // Firebase JS has a known iOS/WebView failure mode where persistence
      // hydration can be delayed or its first callback can hang. Do not turn
      // that delay into a blocking error screen. Open from the best-known
      // snapshot; the listener remains active and can redirect after hydration.
      console.warn('[Startup] AUTH_INITIALIZATION_TIMEOUT', {
        waitedMs: AUTH_STATE_TIMEOUT_MS,
        supportsAuthStateReady,
        action: 'continue_with_current_snapshot',
      });
      openApp(!!getFirebaseAuth()?.currentUser, 'timeout');
    }, AUTH_STATE_TIMEOUT_MS);

    if (!auth) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
      console.error('[Startup] AUTH_LISTENER_ERROR', {
        message: 'Firebase Auth not initialized',
      });
      openApp(false, 'listenerError');
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      try { unsubscribe(); } catch {}
    };
  }, [nav, location.pathname]);

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
