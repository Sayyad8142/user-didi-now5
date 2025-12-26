import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import App from "./App.tsx";
import "./index.css";

// Hide splash screen once app is loaded (for native apps)
if (Capacitor.isNativePlatform()) {
  // Hide splash after a short delay to ensure WebView is ready
  setTimeout(() => {
    SplashScreen.hide();
  }, 500);
}

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
              <App />
              <Toaster />
            </ProfileProvider>
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </BrowserRouter>
  </StrictMode>
);
