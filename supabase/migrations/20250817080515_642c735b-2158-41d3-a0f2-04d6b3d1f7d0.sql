-- Fix security issue: Set proper search_path for admin_set_booking_status function
CREATE OR REPLACE FUNCTION public.admin_set_booking_status(
  p_booking_id UUID,
  p_new_status TEXT,
  p_note TEXT DEFAULT NULL
) 
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
BEGIN
  -- Set the note in session for the trigger to pick up
  PERFORM set_config('app.bsh_note', COALESCE(p_note, ''), true);

  -- Update booking status based on the target status
  IF p_new_status = 'assigned' THEN
    UPDATE public.bookings
       SET status = 'assigned',
           confirmed_at = now()
     WHERE id = p_booking_id;
  ELSIF p_new_status = 'completed' THEN
    UPDATE public.bookings
       SET status = 'completed'
     WHERE id = p_booking_id;
  ELSIF p_new_status = 'cancelled' THEN
    UPDATE public.bookings
       SET status = 'cancelled'
     WHERE id = p_booking_id;
  ELSE
    UPDATE public.bookings
       SET status = p_new_status
     WHERE id = p_booking_id;
  END IF;

  -- Clear the session variable
  PERFORM set_config('app.bsh_note', '', true);
END $$;