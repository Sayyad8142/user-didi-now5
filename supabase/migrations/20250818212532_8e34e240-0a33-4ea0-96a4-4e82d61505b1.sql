-- Fix search_path security issues for functions created in previous migration

-- Update the copy_worker_into_booking function with proper search_path
CREATE OR REPLACE FUNCTION public.copy_worker_into_booking()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE 
  w public.workers;
BEGIN
  IF NEW.worker_id IS NULL THEN
    -- clear if unassigned
    NEW.worker_name := NULL; 
    NEW.worker_phone := NULL; 
    NEW.worker_upi := NULL; 
    NEW.worker_photo_url := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO w FROM public.workers WHERE id = NEW.worker_id;
  IF FOUND THEN
    NEW.worker_name := w.full_name;
    NEW.worker_phone := w.phone;
    NEW.worker_upi := w.upi_id;
    NEW.worker_photo_url := w.photo_url;
  END IF;
  RETURN NEW;
END $$;

-- Update the assign_worker_to_booking function with proper search_path
CREATE OR REPLACE FUNCTION public.assign_worker_to_booking(p_booking_id uuid, p_worker_id uuid)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.bookings b
  SET worker_id = p_worker_id,
      status = 'assigned',
      assigned_at = COALESCE(assigned_at, now())
  WHERE b.id = p_booking_id;
END $$;