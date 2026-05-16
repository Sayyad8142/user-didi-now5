-- =============================================
-- PATCH: Change auto-cancel window from 60 to 90 minutes
-- Run this on the EXTERNAL Supabase project (paywwbuqycovjopryele)
-- Supersedes the 60-minute version in patch-auto-cancel-no-worker.sql
-- =============================================

CREATE OR REPLACE FUNCTION public.auto_cancel_stale_instant_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cancelled_count integer;
BEGIN
  UPDATE bookings
  SET 
    status = 'cancelled',
    cancelled_at = now(),
    cancel_source = 'system',
    cancel_reason = 'Auto-cancelled: no worker accepted within 90 minutes',
    cancellation_reason = 'no_worker_found',
    cancelled_by = 'system',
    updated_at = now()
  WHERE 
    status IN ('pending', 'dispatched')
    AND booking_type = 'instant'
    AND created_at < (now() - interval '90 minutes')
    AND cancelled_at IS NULL;

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;

  INSERT INTO booking_status_history (booking_id, from_status, to_status, note)
  SELECT id, 'pending', 'cancelled', 'Auto-cancelled: no worker found (90 min timeout)'
  FROM bookings
  WHERE 
    status = 'cancelled'
    AND cancel_source = 'system'
    AND cancellation_reason = 'no_worker_found'
    AND cancelled_at >= now() - interval '5 seconds';

  RETURN cancelled_count;
END;
$$;
