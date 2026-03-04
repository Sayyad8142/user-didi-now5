-- Update trigger: require only 1 worker instead of 2, and use user-friendly error message
CREATE OR REPLACE FUNCTION public.validate_scheduled_booking_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dow int;
  v_slot_full text;
  v_count int;
  v_min_workers constant int := 1;
BEGIN
  IF NEW.booking_type != 'scheduled' OR NEW.scheduled_date IS NULL OR NEW.scheduled_time IS NULL THEN
    RETURN NEW;
  END IF;

  v_dow := extract(dow FROM NEW.scheduled_date)::int;
  v_slot_full := lpad(NEW.scheduled_time::text, 8, '0');

  SELECT count(DISTINCT w.id) INTO v_count
  FROM workers w
  JOIN worker_availability wa ON wa.worker_id = w.id
  WHERE w.is_active = true
    AND NEW.community = ANY(w.communities)
    AND NEW.service_type = ANY(w.service_types)
    AND wa.day_of_week = v_dow
    AND v_slot_full = ANY(wa.slots);

  IF v_count < v_min_workers THEN
    RAISE EXCEPTION 'Slot unavailable: No workers are available at this time. Please choose another time slot.';
  END IF;

  RETURN NEW;
END;
$$;