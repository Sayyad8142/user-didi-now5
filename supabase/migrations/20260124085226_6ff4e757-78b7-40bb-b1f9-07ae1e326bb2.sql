-- Fix: support_threads should allow multiple threads per user (different bookings)
-- The unique constraint should be on (user_id, booking_id) not just user_id

-- Drop the existing unique constraint on user_id alone
ALTER TABLE public.support_threads 
DROP CONSTRAINT support_threads_user_id_key;

-- Add composite unique constraint to allow one thread per user per booking
-- Using COALESCE to handle null booking_id values (general support thread)
CREATE UNIQUE INDEX support_threads_user_booking_unique 
ON public.support_threads (user_id, COALESCE(booking_id, '00000000-0000-0000-0000-000000000000'::uuid));