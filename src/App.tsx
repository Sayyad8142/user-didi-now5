import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { UpdateRequiredScreen } from "@/components/UpdateRequiredScreen";
import { NativeUpdateRequiredScreen } from "@/components/NativeUpdateRequiredScreen";
import { SoftUpdateModal } from "@/components/SoftUpdateModal";
import { OfflineScreen } from "@/components/OfflineScreen";
import { NetworkBlockedScreen } from "@/components/NetworkBlockedScreen";
import { useWebVersion } from "@/hooks/useWebVersion";
import { useNativeVersionGate } from "@/hooks/useNativeVersionGate";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BottomTabs } from "@/components/BottomTabs";
import { useBackButton } from "@/hooks/useBackButton";
import { useAppWarmup } from "@/hooks/useAppWarmup";
import AuthGate from "@/auth/AuthGate";


import { initSupabase } from "@/integrations/supabase/client";
import { usePushDeepLink } from "@/hooks/usePushDeepLink";
import { normalizeDeepLink, navigateDeepLink } from "@/lib/deepLink";
import { registerServiceWorker } from "@/lib/registerServiceWorker";

// Register SW early for web push
registerServiceWorker();

// Immediate load for critical pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import VerifyOTP from "./pages/VerifyOTP";
import NotFound from "./pages/NotFound";

// Lazy load non-critical pages
const Home = lazy(() => import("./pages/Home"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Profile = lazy(() => import("./pages/Profile"));
const FAQs = lazy(() => import("./pages/FAQs"));
const BookingForm = lazy(() => import("./features/booking/BookingForm").then(m => ({ default: m.BookingForm })));
// SelectWorkerScreen removed — InstantCheckoutScreen handles worker selection + booking
const InstantCheckoutScreen = lazy(() => import("./features/booking/InstantCheckoutScreen").then(m => ({ default: m.InstantCheckoutScreen })));
const ScheduleScreen = lazy(() => import("./features/booking/ScheduleScreen").then(m => ({ default: m.ScheduleScreen })));
const ChatScreen = lazy(() => import("./features/chat/ChatScreen").then(m => ({ default: m.ChatScreen })));
const TelegramSetup = lazy(() => import("./pages/TelegramSetup"));
const TestTelegram = lazy(() => import("./pages/TestTelegram"));


// Lazy load legal and profile pages
const LegalCenter = lazy(() => import("./routes/LegalCenter"));
const PrivacyPolicy = lazy(() => import("./routes/legal/PrivacyPolicy"));
const PrivacyPolicyScreen = lazy(() => import("./features/legal/PrivacyPolicyScreen").then(m => ({ default: m.PrivacyPolicyScreen })));
const TermsScreen = lazy(() => import("./features/legal/TermsScreen").then(m => ({ default: m.TermsScreen })));
const AccountSettings = lazy(() => import("./routes/profile/AccountSettings"));
const BookingDetail = lazy(() => import("./pages/BookingDetail"));
const SupportScreen = lazy(() => import("./routes/support/SupportScreen"));

const Diagnostics = lazy(() => import("./pages/Diagnostics"));

// Loading component with pink background
const PageLoader = () => (
  <div className="min-h-screen gradient-bg flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="relative safe-top">
    <div className="pb-safe-bottom">
      {children}
    </div>
    <BottomTabs />
  </div>
);

const AppContent = () => {
  useBackButton();
  const navigate = useNavigate();
  usePushDeepLink(navigate);

  // Handle ?dl= query param and SW postMessage deep links
  useEffect(() => {
    // 1. Query param  ?dl=/booking/abc
    const params = new URLSearchParams(window.location.search);
    const dl = params.get('dl');
    if (dl) {
      const path = normalizeDeepLink(dl);
      if (path) {
        navigateDeepLink(path, navigate);
      }
      // Remove ?dl from URL without reload
      params.delete('dl');
      const clean = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (clean ? `?${clean}` : ''));
    }

    // 2. Listen for SW postMessage deep links (web push click on existing tab)
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'DEEP_LINK' && event.data.path) {
        const path = normalizeDeepLink(event.data.path);
        if (path) navigateDeepLink(path, navigate);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [navigate]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/verify" element={<VerifyOTP />} />
        <Route path="/legal" element={<LegalCenter />} />
        <Route path="/legal/privacy" element={<PrivacyPolicyScreen />} />
        <Route path="/legal/privacy-pdf" element={<PrivacyPolicy />} />
        <Route path="/legal/terms" element={<TermsScreen />} />
        <Route path="/home" element={<ProtectedRoute><ProtectedLayout><Home /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute><ProtectedLayout><Bookings /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/booking/:id" element={<ProtectedRoute><ProtectedLayout><BookingDetail /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProtectedLayout><Profile /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/profile/account" element={<ProtectedRoute><ProtectedLayout><AccountSettings /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><ProtectedLayout><SupportScreen /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />
        
        <Route path="/faqs" element={<ProtectedRoute><ProtectedLayout><FAQs /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/book/:service_type" element={<ProtectedRoute><ProtectedLayout><BookingForm /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/book/:service_type/instant" element={<ProtectedRoute><ProtectedLayout><InstantCheckoutScreen /></ProtectedLayout></ProtectedRoute>} />
        {/* select-worker route removed — merged into /instant */}
        <Route path="/book/:service_type/schedule" element={<ProtectedRoute><ProtectedLayout><ScheduleScreen /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/telegram-setup" element={<TelegramSetup />} />
        <Route path="/test-telegram" element={<Suspense fallback={<PageLoader />}><TestTelegram /></Suspense>} />
        <Route path="/diagnostics" element={<Diagnostics />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkBlocked, setNetworkBlocked] = useState(false);
  const [resolving, setResolving] = useState(true);
  const { updateAvailable, updateMode, handleRefresh, dismissUpdate } = useWebVersion();
  const nativeGate = useNativeVersionGate();
  const maintenance = useMaintenanceMode();

  useAppWarmup();

  const resolveBackend = useCallback(async () => {
    setResolving(true);
    setNetworkBlocked(false);
    try {
      const ok = await initSupabase();
      setNetworkBlocked(!ok);
    } catch {
      setNetworkBlocked(true);
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    resolveBackend();
  }, [resolveBackend]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOnline) {
    return <OfflineScreen onRetry={() => setIsOnline(navigator.onLine)} />;
  }

  // Show loader while resolving backend or checking native version or maintenance
  if (resolving || nativeGate.checking || maintenance.checking) {
    return <PageLoader />;
  }

  // Native force update — block entire app
  if (nativeGate.status === 'force_update') {
    return (
      <NativeUpdateRequiredScreen
        message={nativeGate.message}
        storeUrl={nativeGate.storeUrl}
        currentVersion={nativeGate.currentVersion}
        requiredVersion={nativeGate.requiredVersion}
        releaseNotes={nativeGate.releaseNotes}
      />
    );
  }

  // Maintenance mode — block before network/update checks
  if (maintenance.isMaintenance) {
    return (
      <MaintenanceScreen
        title={maintenance.title}
        message={maintenance.message}
        ctaLabel={maintenance.ctaLabel}
        onRetry={maintenance.recheck}
      />
    );
  }

  if (networkBlocked) {
    return (
      <NetworkBlockedScreen
        onRetry={() => {
          resolveBackend();
        }}
      />
    );
  }

  // Hard/force update: block entire UI (web)
  if (updateAvailable && updateMode === 'block') {
    return <UpdateRequiredScreen onRefresh={handleRefresh} />;
  }

  return (
    <TooltipProvider>
      {updateAvailable && updateMode === 'soft' && (
        <UpdateBanner onRefresh={handleRefresh} onDismiss={dismissUpdate} />
      )}
      {nativeGate.status === 'soft_update' && (
        <SoftUpdateModal
          title={nativeGate.title}
          message={nativeGate.message}
          storeUrl={nativeGate.storeUrl}
          currentVersion={nativeGate.currentVersion}
          latestVersion={nativeGate.latestVersion}
          onDismiss={nativeGate.dismissSoftUpdate}
        />
      )}
      <Toaster />
      <Sonner />
      <AuthGate>
        <AppContent />
      </AuthGate>
    </TooltipProvider>
  );
};

export default App;
