-- Fix off-by-one day-of-week mismatch between worker app (Mon=0..Sun=6)
-- and PostgreSQL's extract(dow) (Sun=0..Sat=6).
--
-- Symptom: Worker selects slots on Saturday in worker app, but those slots
-- show up on Friday in user app's schedule screen.
--
-- Root cause: worker_availability.day_of_week is written by the worker app
-- using JS Mon-first index (Mon=0, ..., Sat=5, Sun=6).
-- The user app RPC + validation trigger used extract(dow) which is Sun-first
-- (Sun=0, ..., Sat=6). So for a Friday (PG dow=5) it returned Saturday's data.
--
-- Conversion: worker_dow = (pg_dow + 6) % 7
--   PG  Sun=0 -> Worker 6 (Sun)
--   PG  Mon=1 -> Worker 0 (Mon)
--   ...
--   PG  Sat=6 -> Worker 5 (Sat)
--
-- Run this against the EXTERNAL Supabase DB (api.didisnow.com).

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
  -- Convert PG dow (Sun=0..Sat=6) to worker app dow (Mon=0..Sun=6)
  v_dow := (extract(dow FROM p_date)::int + 6) % 7;

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

  -- Convert PG dow (Sun=0..Sat=6) to worker app dow (Mon=0..Sun=6)
  v_dow := (extract(dow FROM NEW.scheduled_date)::int + 6) % 7;
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

-- Also fix the scheduled-dispatch matcher if it uses the same convention.
-- Check: SELECT prosrc FROM pg_proc WHERE proname ILIKE '%dispatch%' OR proname ILIKE '%scheduled%';
