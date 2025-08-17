-- Fix security issues: Set proper search_path for functions
CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history
      (booking_id, from_status, to_status, changed_by, note)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NULL);
  END IF;
  RETURN NEW;
END $$;