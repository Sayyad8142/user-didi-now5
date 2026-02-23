
-- Drop duplicate constraint (not index) 
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_booking_worker_unique;
