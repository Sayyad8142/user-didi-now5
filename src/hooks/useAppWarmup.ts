import { useEffect } from 'react';

// Preload all main user screens in background after app loads
export function useAppWarmup() {
  useEffect(() => {
    // Wait for initial render to complete, then preload in background
    const timer = setTimeout(() => {
      // Preload main tab screens (highest priority)
      Promise.all([
        import('@/pages/Home'),
        import('@/pages/Bookings'),
        import('@/pages/Profile'),
        import('@/pages/FAQs'),
      ]).catch(() => {});

      // Preload secondary screens after a short delay
      setTimeout(() => {
        Promise.all([
          import('@/features/booking/BookingForm'),
          import('@/features/booking/ScheduleScreen'),
          import('@/features/chat/ChatScreen'),
          import('@/routes/support/SupportScreen'),
          import('@/routes/profile/AccountSettings'),
          import('@/features/legal/PrivacyPolicyScreen'),
          import('@/features/legal/TermsScreen'),
        ]).catch(() => {});
      }, 500);
    }, 100);

    return () => clearTimeout(timer);
  }, []);
}
