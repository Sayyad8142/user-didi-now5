-- Fix the trigger to properly copy worker data when assigning
DROP TRIGGER IF EXISTS copy_worker_data_trigger ON bookings;

CREATE OR REPLACE FUNCTION copy_worker_into_booking()
RETURNS TRIGGER AS $$
DECLARE 
  w public.workers;
BEGIN
  -- Only process if worker_id is being set or changed
  IF NEW.worker_id IS DISTINCT FROM OLD.worker_id THEN
    IF NEW.worker_id IS NULL THEN
      -- Clear worker data if unassigned
      NEW.worker_name := NULL; 
      NEW.worker_phone := NULL; 
      NEW.worker_upi := NULL; 
      NEW.worker_photo_url := NULL;
    ELSE
      -- Copy worker data from workers table
      SELECT * INTO w FROM public.workers WHERE id = NEW.worker_id;
      IF FOUND THEN
        NEW.worker_name := w.full_name;
        NEW.worker_phone := w.phone;
        NEW.worker_upi := w.upi_id;
        NEW.worker_photo_url := w.photo_url;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Create the trigger
CREATE TRIGGER copy_worker_data_trigger
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION copy_worker_into_booking();