
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
    cancel_reason = 'Auto-cancelled: no worker accepted within 60 minutes',
    updated_at = now()
  WHERE 
    status = 'pending'
    AND booking_type = 'instant'
    AND created_at < (now() - interval '60 minutes')
    AND cancelled_at IS NULL;

  GET DIAGNOSTICS cancelled_count = ROW_COUNT;

  -- Log to booking_status_history for each cancelled booking
  INSERT INTO booking_status_history (booking_id, from_status, to_status, note)
  SELECT id, 'pending', 'cancelled', 'Auto-cancelled: stale instant booking (60 min timeout)'
  FROM bookings
  WHERE 
    status = 'cancelled'
    AND cancel_source = 'system'
    AND cancel_reason = 'Auto-cancelled: no worker accepted within 60 minutes'
    AND cancelled_at >= now() - interval '5 seconds';

  RETURN cancelled_count;
END;
$$;
