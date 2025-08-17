-- Enhanced trigger to accept notes via session setting
CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_note TEXT := current_setting('app.bsh_note', true);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history
      (booking_id, from_status, to_status, changed_by, note)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), v_note);
  END IF;
  RETURN NEW;
END $$;

-- Admin helper function to atomically update status AND pass a note
CREATE OR REPLACE FUNCTION public.admin_set_booking_status(
  p_booking_id UUID,
  p_new_status TEXT,
  p_note TEXT DEFAULT NULL
) 
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
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