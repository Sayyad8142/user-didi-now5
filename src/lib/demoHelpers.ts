import { supabase } from '@/integrations/supabase/client';

export const createDemoBooking = async (bookingData: any) => {
  // For demo users, tag bookings as demo
  const isDemoUser = bookingData.user_email === import.meta.env.VITE_DEMO_EMAIL;
  
  return await supabase
    .from('bookings')
    .insert({
      ...bookingData,
      is_demo: isDemoUser,
    });
};

export const shouldBlockNotifications = (booking: any): boolean => {
  // Block real notifications for demo bookings
  return booking.is_demo === true;
};

export const isDemoBooking = (booking: any): boolean => {
  return booking.is_demo === true;
};