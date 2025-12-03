-- Disable the SQL-based scheduled booking cron job (it has broken FCM)
-- The edge function check-scheduled-bookings will handle everything

-- First, update the SQL function to do nothing (safer than unscheduling)
CREATE OR REPLACE FUNCTION public.run_scheduled_prealerts(p_window_minutes integer DEFAULT 15)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function is now disabled. 
  -- Scheduled booking alerts are handled by the check-scheduled-bookings edge function.
  RAISE NOTICE 'run_scheduled_prealerts is disabled - handled by edge function';
END;
$$;

-- Reset prealert_sent for pending scheduled bookings that have no booking_requests
-- These were marked by the broken SQL function but never actually notified workers
UPDATE bookings 
SET prealert_sent = false, updated_at = now()
WHERE booking_type = 'scheduled' 
  AND status = 'pending'
  AND prealert_sent = true
  AND id NOT IN (
    SELECT DISTINCT booking_id FROM booking_requests WHERE booking_id IS NOT NULL
  );