-- Drop the trigger that's causing booking failures
-- Using CASCADE to remove dependencies

DROP TRIGGER IF EXISTS trigger_notify_new_booking ON public.bookings CASCADE;

-- Now drop the function
DROP FUNCTION IF EXISTS public.notify_new_booking() CASCADE;