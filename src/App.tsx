import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect, Suspense, lazy } from "react";
import React from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { OfflineScreen } from "@/components/OfflineScreen";
import { useWebVersion } from "@/hooks/useWebVersion";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BottomTabs } from "@/components/BottomTabs";
import { useBackButton } from "@/hooks/useBackButton";
import { clearGuest } from "@/lib/guest";
import { supabase } from "@/integrations/supabase/client";
import RequireAuth from "@/components/routing/RequireAuth";

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
const ScheduleScreen = lazy(() => import("./features/booking/ScheduleScreen").then(m => ({ default: m.ScheduleScreen })));
const ChatScreen = lazy(() => import("./features/chat/ChatScreen").then(m => ({ default: m.ChatScreen })));

// Lazy load admin pages
const AdminGate = lazy(() => import("./features/admin/AdminGate").then(m => ({ default: m.AdminGate })));
const AdminLayout = lazy(() => import("./routes/admin/AdminLayout"));
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

// Loading component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const queryClient = new QueryClient();

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="relative">
    {children}
    <BottomTabs />
  </div>
);

const AppContent = () => {
  // Handle hardware back button on mobile devices (inside Router context)
  useBackButton();

  // Clear guest mode when user signs in or out
  React.useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session || event === 'SIGNED_OUT') {
        clearGuest();
      }
    });

    return () => subscription.unsubscribe();
  }, []);
  
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
        <Route 
          path="/home" 
          element={
            <RequireAuth allowGuest>
              <ProtectedLayout>
                <Home />
              </ProtectedLayout>
            </RequireAuth>
          } 
        />
        <Route 
          path="/bookings" 
          element={
            <RequireAuth>
              <ProtectedLayout>
                <Bookings />
              </ProtectedLayout>
            </RequireAuth>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <RequireAuth>
              <ProtectedLayout>
                <Profile />
              </ProtectedLayout>
            </RequireAuth>
          } 
        />
        <Route 
          path="/profile/account" 
          element={
            <RequireAuth>
              <ProtectedLayout>
                <AccountSettings />
              </ProtectedLayout>
            </RequireAuth>
          } 
        />
        <Route 
          path="/support" 
          element={
            <RequireAuth>
              <ProtectedLayout>
                <SupportScreen />
              </ProtectedLayout>
            </RequireAuth>
          } 
        />
        <Route 
          path="/chat" 
          element={
            <RequireAuth>
              <ChatScreen />
            </RequireAuth>
          } 
        />
        <Route 
          path="/faqs" 
          element={
            <RequireAuth allowGuest>
              <ProtectedLayout>
                <FAQs />
              </ProtectedLayout>
            </RequireAuth>
          } 
        />
        <Route 
          path="/book/:service_type" 
          element={
            <RequireAuth>
              <ProtectedLayout>
                <BookingForm />
              </ProtectedLayout>
            </RequireAuth>
          } 
        />
        <Route 
          path="/book/:service_type/schedule" 
          element={
            <RequireAuth>
              <ProtectedLayout>
                <ScheduleScreen />
              </ProtectedLayout>
            </RequireAuth>
          } 
        />
        <Route 
          path="/admin/*" 
          element={
            <AdminGate>
              <AdminLayout />
            </AdminGate>
          } 
        />
        <Route 
          path="/admin/pricing" 
          element={
            <AdminGate>
              <AdminPricing />
            </AdminGate>
          } 
        />
        <Route 
          path="/admin/settings" 
          element={
            <AdminGate>
              <AdminSettings />
            </AdminGate>
          } 
        />
        <Route 
          path="/admin/daily-bookings" 
          element={
            <AdminGate>
              <AdminDailyBookings />
            </AdminGate>
          } 
        />
        <Route 
          path="/admin/feedback" 
          element={
            <AdminGate>
              <AdminFeedback />
            </AdminGate>
          } 
        />
        <Route 
          path="/admin/completed-bookings" 
          element={
            <AdminGate>
              <AdminCompletedBookings />
            </AdminGate>
          } 
        />
        <Route 
          path="/admin/workers" 
          element={
            <AdminGate>
              <AdminWorkers />
            </AdminGate>
          } 
        />
        <Route 
          path="/admin/chat" 
          element={
            <AdminGate>
              <AdminChat />
            </AdminGate>
          } 
        />
        <Route 
          path="/admin/bookings" 
          element={
            <AdminGate>
              <AdminBookings />
            </AdminGate>
          } 
        />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { updateAvailable, handleRefresh, dismissUpdate } = useWebVersion();

  useEffect(() => {
    // Simple online/offline detection
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return <OfflineScreen onRetry={() => setIsOnline(navigator.onLine)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          {updateAvailable && (
            <UpdateBanner onRefresh={handleRefresh} onDismiss={dismissUpdate} />
          )}
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
