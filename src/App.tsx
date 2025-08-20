import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BottomTabs } from "@/components/BottomTabs";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import VerifyOTP from "./pages/VerifyOTP";
import Home from "./pages/Home";
import Bookings from "./pages/Bookings";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import { BookingForm } from "./features/booking/BookingForm";
import { ScheduleScreen } from "./features/booking/ScheduleScreen";
import { AdminGate } from "./features/admin/AdminGate";
import AdminLayout from "./routes/admin/AdminLayout";
import AdminPricing from "./routes/admin/AdminPricing";
import AdminSettings from "./routes/admin/AdminSettings";
import AdminDailyBookings from "./routes/admin/AdminDailyBookings";
import AdminLogin from "./routes/auth/AdminLogin";
import AdminVerify from "./routes/auth/AdminVerify";
import LegalCenter from "./routes/LegalCenter";
import AccountSettings from "./routes/profile/AccountSettings";
import SupportScreen from "./routes/support/SupportScreen";
import AdminFeedback from "./routes/admin/AdminFeedback";

const queryClient = new QueryClient();

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="relative">
    {children}
    <BottomTabs />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/verify" element={<VerifyOTP />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin-verify" element={<AdminVerify />} />
            <Route path="/legal" element={<LegalCenter />} />
            <Route 
              path="/home" 
              element={
                <ProtectedRoute>
                  <ProtectedLayout>
                    <Home />
                  </ProtectedLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/bookings" 
              element={
                <ProtectedRoute>
                  <ProtectedLayout>
                    <Bookings />
                  </ProtectedLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <ProtectedLayout>
                    <Profile />
                  </ProtectedLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/profile/account" 
              element={
                <ProtectedRoute>
                  <ProtectedLayout>
                    <AccountSettings />
                  </ProtectedLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/support" 
              element={
                <ProtectedRoute>
                  <ProtectedLayout>
                    <SupportScreen />
                  </ProtectedLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/book/:service_type" 
              element={
                <ProtectedRoute>
                  <ProtectedLayout>
                    <BookingForm />
                  </ProtectedLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/book/:service_type/schedule" 
              element={
                <ProtectedRoute>
                  <ProtectedLayout>
                    <ScheduleScreen />
                  </ProtectedLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
