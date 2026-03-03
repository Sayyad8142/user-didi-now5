import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route } from "react-router-dom";
import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { UpdateRequiredScreen } from "@/components/UpdateRequiredScreen";
import { NativeUpdateRequiredScreen } from "@/components/NativeUpdateRequiredScreen";
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
import { IncomingCallHandler } from "@/components/IncomingCallHandler";
import { PushNotificationProvider } from "@/components/PushNotificationProvider";
import { initSupabase } from "@/integrations/supabase/client";

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

// Lazy load admin pages
const AdminGate = lazy(() => import("./features/admin/AdminGate").then(m => ({ default: m.AdminGate })));
const AdminLayout = lazy(() => import("./routes/admin/AdminLayout"));
const AdminCommunities = lazy(() => import("./routes/admin/AdminCommunities"));
const AdminUsers = lazy(() => import("./routes/admin/AdminUsers"));
const AdminPricing = lazy(() => import("./routes/admin/AdminPricing"));
const AdminSettings = lazy(() => import("./routes/admin/AdminSettings"));
const AdminDailyBookings = lazy(() => import("./routes/admin/AdminDailyBookings"));
const AdminLogin = lazy(() => import("./routes/auth/AdminLogin"));
const AdminVerify = lazy(() => import("./routes/auth/AdminVerify"));
const AdminChat = lazy(() => import("./routes/admin/AdminChat"));
const AdminFeedback = lazy(() => import("./routes/admin/AdminFeedback"));
const AdminCompletedBookings = lazy(() => import("./routes/admin/AdminCompletedBookings"));
const AdminWorkers = lazy(() => import("./routes/admin/AdminWorkers"));
const AdminBookings = lazy(() => import("./routes/admin/AdminBookings"));

// Lazy load legal and profile pages
const LegalCenter = lazy(() => import("./routes/LegalCenter"));
const PrivacyPolicy = lazy(() => import("./routes/legal/PrivacyPolicy"));
const PrivacyPolicyScreen = lazy(() => import("./features/legal/PrivacyPolicyScreen").then(m => ({ default: m.PrivacyPolicyScreen })));
const TermsScreen = lazy(() => import("./features/legal/TermsScreen").then(m => ({ default: m.TermsScreen })));
const AccountSettings = lazy(() => import("./routes/profile/AccountSettings"));
const SupportScreen = lazy(() => import("./routes/support/SupportScreen"));
const CallPage = lazy(() => import("./pages/CallPage"));
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
  
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/verify" element={<VerifyOTP />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/admin-verify" element={<AdminVerify />} />
        <Route path="/legal" element={<LegalCenter />} />
        <Route path="/legal/privacy" element={<PrivacyPolicyScreen />} />
        <Route path="/legal/privacy-pdf" element={<PrivacyPolicy />} />
        <Route path="/legal/terms" element={<TermsScreen />} />
        <Route path="/home" element={<ProtectedRoute><ProtectedLayout><Home /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute><ProtectedLayout><Bookings /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProtectedLayout><Profile /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/profile/account" element={<ProtectedRoute><ProtectedLayout><AccountSettings /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><ProtectedLayout><SupportScreen /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />
        <Route path="/call" element={<ProtectedRoute><CallPage /></ProtectedRoute>} />
        <Route path="/faqs" element={<ProtectedRoute><ProtectedLayout><FAQs /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/book/:service_type" element={<ProtectedRoute><ProtectedLayout><BookingForm /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/book/:service_type/instant" element={<ProtectedRoute><ProtectedLayout><InstantCheckoutScreen /></ProtectedLayout></ProtectedRoute>} />
        {/* select-worker route removed — merged into /instant */}
        <Route path="/book/:service_type/schedule" element={<ProtectedRoute><ProtectedLayout><ScheduleScreen /></ProtectedLayout></ProtectedRoute>} />
        <Route path="/admin" element={<AdminGate><AdminLayout /></AdminGate>} />
        <Route path="/admin/communities" element={<AdminGate><AdminCommunities /></AdminGate>} />
        <Route path="/admin/users" element={<AdminGate><AdminUsers /></AdminGate>} />
        <Route path="/admin/pricing" element={<AdminGate><AdminPricing /></AdminGate>} />
        <Route path="/admin/settings" element={<AdminGate><AdminSettings /></AdminGate>} />
        <Route path="/admin/daily-bookings" element={<AdminGate><AdminDailyBookings /></AdminGate>} />
        <Route path="/admin/feedback" element={<AdminGate><AdminFeedback /></AdminGate>} />
        <Route path="/admin/completed-bookings" element={<AdminGate><AdminCompletedBookings /></AdminGate>} />
        <Route path="/admin/workers" element={<AdminGate><AdminWorkers /></AdminGate>} />
        <Route path="/admin/chat" element={<AdminGate><AdminChat /></AdminGate>} />
        <Route path="/admin/bookings" element={<AdminGate><AdminBookings /></AdminGate>} />
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

  // Native version too old — block entire app
  if (nativeGate.blocked) {
    return (
      <NativeUpdateRequiredScreen
        message={nativeGate.message}
        storeUrl={nativeGate.storeUrl}
        currentVersion={nativeGate.currentVersion}
        requiredVersion={nativeGate.requiredVersion}
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

  // Hard/force update: block entire UI
  if (updateAvailable && updateMode === 'block') {
    return <UpdateRequiredScreen onRefresh={handleRefresh} />;
  }

  return (
    <TooltipProvider>
      {updateAvailable && updateMode === 'soft' && (
        <UpdateBanner onRefresh={handleRefresh} onDismiss={dismissUpdate} />
      )}
      <Toaster />
      <Sonner />
      <AuthGate>
        <PushNotificationProvider>
          <AppContent />
          <IncomingCallHandler />
        </PushNotificationProvider>
      </AuthGate>
    </TooltipProvider>
  );
};

export default App;
