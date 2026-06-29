import { mark } from "@/lib/perfMarks";
mark("main.tsx.import");
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { PushNotificationProvider } from "@/components/PushNotificationProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// ── Early global error capture ───────────────────────────────────────────────
// MUST run before any other code that might throw, so iOS WKWebView's vague
// "JS Eval error: A JavaScript exception occurred" gets a real stack trace.
(function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  const showStartupError = (label: string, err: unknown) => {
    try {
      const msg =
        (err as any)?.stack ||
        (err as any)?.message ||
        (typeof err === "string" ? err : JSON.stringify(err));
      console.error(`[Startup:${label}]`, err);
      const root = document.getElementById("root");
      const splash = document.getElementById("app-splash");
      const reactMounted = !!root && root.childElementCount > 0;
      if (!reactMounted) {
        if (splash) splash.remove();
        if (root) {
          root.innerHTML = `
            <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;text-align:center;">
              <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
              <h1 style="font-size:18px;font-weight:700;margin:0 0 8px;">Couldn't start the app</h1>
              <p style="font-size:14px;color:#555;margin:0 0 16px;max-width:320px;">${label}. Please check your connection and try again.</p>
              <button onclick="window.location.reload()" style="background:#ec4899;color:#fff;border:0;padding:10px 24px;border-radius:9999px;font-weight:600;font-size:14px;">Reload</button>
              <pre style="margin-top:16px;font-size:10px;color:#888;max-width:90vw;white-space:pre-wrap;text-align:left;max-height:30vh;overflow:auto;">${String(msg).slice(0, 1500)}</pre>
            </div>`;
        }
      }
    } catch {}
  };
  window.addEventListener("error", (e) => showStartupError("error", e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => showStartupError("unhandledrejection", e.reason));

  // Always-on runtime stack capture for production debugging.
  // Logs full stack trace + filename + line for any uncaught error, even after React mounts.
  window.addEventListener("error", (e) => {
    try {
      const err: any = e.error || {};
      console.error("[RUNTIME_ERROR]", {
        message: e.message || err?.message,
        filename: (e as any).filename,
        lineno: (e as any).lineno,
        colno: (e as any).colno,
        name: err?.name,
        stack: err?.stack,
      });
    } catch {}
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      const r: any = (e as any).reason || {};
      console.error("[UNHANDLED_REJECTION]", {
        message: r?.message ?? String(r),
        name: r?.name,
        stack: r?.stack,
      });
    } catch {}
  });
})();

// @ts-ignore - injected by Vite define
console.info("[App] Build ID:", typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev");

// Hide native splash screen once WebView content is painted
// Keep native splash visible until HTML splash is rendered
(async () => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      // Wait for first paint to ensure HTML splash is visible
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          SplashScreen.hide();
        });
      });
    }
  } catch (e) {
    // Capacitor not available (web build)
  }
})();

// Set dynamic --vh for mobile viewport
const setVH = () => {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
};
setVH();
window.addEventListener('resize', setVH);

// Create QueryClient with longer gc and stale time for better performance
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // cache longer so first open after kill pulls from disk instantly
      gcTime: 1000 * 60 * 30,      // 30 min
      staleTime: 1000 * 60 * 5,    // 5 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

mark("react.createRoot");
try {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary fallbackTitle="The app couldn't start">
        <BrowserRouter>
          <HelmetProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <ProfileProvider>
                  <PushNotificationProvider>
                    <App />
                  </PushNotificationProvider>
                </ProfileProvider>
              </AuthProvider>
            </QueryClientProvider>
          </HelmetProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>
  );
} catch (err) {
  console.error("[Startup] createRoot.render threw:", err);
  window.dispatchEvent(new ErrorEvent("error", { error: err as any }));
}
