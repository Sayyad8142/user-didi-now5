import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { PushNotificationProvider } from "@/components/PushNotificationProvider";
import App from "./App.tsx";
import "./index.css";

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

createRoot(rootElement).render(
  <StrictMode>
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
  </StrictMode>
);
