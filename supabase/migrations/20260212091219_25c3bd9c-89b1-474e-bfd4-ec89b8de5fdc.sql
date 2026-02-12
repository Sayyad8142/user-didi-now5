
-- Drop the broken trigger that calls non-existent 'booking-notifications' edge function (causes 404)
DROP TRIGGER IF EXISTS tr_booking_push ON public.bookings;
DROP FUNCTION IF EXISTS public.enqueue_booking_push();

-- Drop the broken trigger that calls non-existent 'send-onesignal' edge function
DROP TRIGGER IF EXISTS tr_notify_on_assignment_v1 ON public.bookings;
DROP FUNCTION IF EXISTS public.notify_on_assignment_v1();
