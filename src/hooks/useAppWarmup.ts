import { useEffect } from 'react';

// Preload screens in background after app loads - no blocking!
export function useAppWarmup() {
  useEffect(() => {
    // Use requestIdleCallback for non-blocking preload (fallback to setTimeout)
    const schedulePreload = (callback: () => void) => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(callback, { timeout: 2000 });
      } else {
        setTimeout(callback, 200);
      }
    };

    schedulePreload(() => {
      // Preload main tab screens first (parallel, non-blocking)
      Promise.all([
        import('@/pages/Home'),
        import('@/pages/Bookings'),
        import('@/pages/Profile'),
        import('@/pages/FAQs'),
      ]).catch(() => {});
    });

    // Preload secondary screens after main screens
    const secondaryTimer = setTimeout(() => {
      schedulePreload(() => {
        Promise.all([
          import('@/features/booking/BookingForm'),
          import('@/features/booking/ScheduleScreen'),
          import('@/routes/support/SupportScreen'),
        ]).catch(() => {});
      });
    }, 1000);

    return () => clearTimeout(secondaryTimer);
  }, []);
}
