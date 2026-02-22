
-- Update RPC: remove is_available and is_busy filters (real-time signals not relevant for future scheduling)
CREATE OR REPLACE FUNCTION public.get_scheduled_slot_availability(
  p_community text,
  p_service_type text,
  p_date date
)
RETURNS TABLE(slot_time text, worker_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_dow int;
  v_slot_start text;
  v_slot_end text;
BEGIN
  v_dow := extract(dow FROM p_date)::int;

  IF p_service_type = 'cook' THEN
    v_slot_start := '06:00:00';
    v_slot_end := '21:00:00';
  ELSE
    v_slot_start := '06:00:00';
    v_slot_end := '19:00:00';
  END IF;

  RETURN QUERY
  WITH time_slots AS (
    SELECT to_char(gs, 'HH24:MI') AS st,
           to_char(gs, 'HH24:MI:SS') AS st_full
    FROM generate_series(
      p_date + v_slot_start::time,
      p_date + v_slot_end::time,
      interval '30 minutes'
    ) AS gs
  )
  SELECT
    ts.st AS slot_time,
    COALESCE(
      (SELECT count(DISTINCT w.id)::int
       FROM workers w
       JOIN worker_availability wa ON wa.worker_id = w.id
       WHERE w.is_active = true
         AND p_community = ANY(w.communities)
         AND p_service_type = ANY(w.service_types)
         AND wa.day_of_week = v_dow
         AND ts.st_full = ANY(wa.slots)
      ), 0
    ) AS worker_count
  FROM time_slots ts
  ORDER BY ts.st;
END;
$$;

-- Update trigger function: remove is_available and is_busy filters
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

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No workers available for this slot. Please choose another time.';
  END IF;

  RETURN NEW;
END;
$$;
