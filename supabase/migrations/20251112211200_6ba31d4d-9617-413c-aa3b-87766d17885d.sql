-- Drop the problematic trigger and function that's causing the cancellation error
-- This trigger tries to use app.settings.supabase_url which doesn't exist

DROP TRIGGER IF EXISTS booking_status_notification_trigger ON public.bookings;
DROP FUNCTION IF EXISTS public.notify_booking_status_change() CASCADE;