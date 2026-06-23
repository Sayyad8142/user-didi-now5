-- =====================================================================
-- FIX: get_scheduled_slot_availability + validate_scheduled_booking_slot
-- worker_availability.slots is text[] of slot LABELS (e.g. '06:00:00',
-- '06:30:00', ... '18:30:00'). A worker is rostered for a slot when its
-- label is present in the array (matches admin Slot Availability logic).
-- Previous patch wrongly treated it as boolean[] -> all slots SOLD OUT.
-- available = rostered (label ∈ wa.slots) − active bookings at that slot
-- Active statuses: pending, dispatched, accepted, assigned, confirmed,
--                  on_the_way, in_progress
-- 30-min safety buffer applied for today's slots. Safe to re-run.
-- =====================================================================


CREATE OR REPLACE FUNCTION public.get_scheduled_slot_availability(
  p_community    text,
  p_service_type text,
  p_date         date
)
RETURNS TABLE(slot_time text, worker_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_dow         int;
  v_min_ts      timestamptz := now() + interval '30 minutes';
  v_is_today    boolean     := (p_date = (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_slot_count  int         := 26;             -- 06:00 .. 18:30 (inclusive) in 30-min steps
  v_base_minute int         := 6 * 60;         -- 06:00 in minutes from midnight
BEGIN
  v_dow := extract(dow FROM p_date)::int;

  RETURN QUERY
  WITH slot_idx AS (
    SELECT
      i,
      lpad(((v_base_minute + i*30) / 60)::text, 2, '0') || ':' ||
        lpad(((v_base_minute + i*30) % 60)::text, 2, '0')                                    AS st,
      make_time(((v_base_minute + i*30) / 60)::int, ((v_base_minute + i*30) % 60)::int, 0)       AS st_time,
      ((p_date::timestamp + make_interval(mins => v_base_minute + i*30))
        AT TIME ZONE 'Asia/Kolkata')                                                          AS slot_ts
    FROM generate_series(0, v_slot_count - 1) AS i
  ),
  rostered AS (
    SELECT s.i, s.st, s.slot_ts, COUNT(*)::int AS cnt
    FROM slot_idx s
    JOIN public.worker_availability wa ON wa.day_of_week = v_dow
    JOIN public.workers w              ON w.id = wa.worker_id
    WHERE w.is_active = true
      AND p_service_type = ANY(w.service_types)
      AND p_community    = ANY(w.communities)
      AND wa.slots IS NOT NULL
      -- worker_availability.slots is text[] of slot labels (e.g. '06:00:00','06:30:00',...,'18:30:00').
      -- A worker is rostered for slot s.i if its label exists in the array.
      AND ((s.st || ':00') = ANY(wa.slots) OR s.st = ANY(wa.slots))
    GROUP BY s.i, s.st, s.slot_ts
  ),
  booked AS (
    SELECT s.i, COUNT(*)::int AS cnt
    FROM slot_idx s
    JOIN public.bookings b
      ON b.scheduled_date = p_date
     AND b.service_type   = p_service_type
     AND b.community      = p_community
     AND b.status IN ('pending','dispatched','accepted','assigned',
                      'confirmed','on_the_way','in_progress')
     AND b.scheduled_time = s.st_time
    GROUP BY s.i
  )
  SELECT
    s.st AS slot_time,
    CASE
      WHEN v_is_today AND s.slot_ts < v_min_ts THEN 0
      ELSE GREATEST(0, COALESCE(r.cnt,0) - COALESCE(bk.cnt,0))
    END::int AS worker_count
  FROM slot_idx s
  LEFT JOIN rostered r ON r.i = s.i
  LEFT JOIN booked   bk ON bk.i = s.i
  ORDER BY s.i;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scheduled_slot_availability(text,text,date)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Trigger function: hard-stop overbooking + buffer at insert/update
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_scheduled_booking_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_dow       int;
  v_st        text;
  v_idx       int;
  v_base      int := 6 * 60;
  v_slot_ts   timestamptz;
  v_min_ts    timestamptz := now() + interval '30 minutes';
  v_rostered  int;
  v_booked    int;
  v_remaining int;
  v_minutes   int;
BEGIN
  IF NEW.booking_type IS DISTINCT FROM 'scheduled'
     OR NEW.scheduled_date IS NULL
     OR NEW.scheduled_time IS NULL THEN
    RETURN NEW;
  END IF;

  v_dow := extract(dow FROM NEW.scheduled_date)::int;
  v_st  := substring(NEW.scheduled_time::text, 1, 5);  -- HH:MM

  v_minutes := (split_part(v_st,':',1))::int * 60 + (split_part(v_st,':',2))::int;
  v_idx := (v_minutes - v_base) / 30;

  IF v_idx < 0 OR v_idx > 25 OR ((v_minutes - v_base) % 30) <> 0 THEN
    RAISE EXCEPTION 'Invalid scheduled_time % (must be a 30-min slot between 06:00 and 18:30)', v_st;
  END IF;

  v_slot_ts := (NEW.scheduled_date::timestamp + make_interval(mins => v_minutes))
                 AT TIME ZONE 'Asia/Kolkata';

  IF NEW.scheduled_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
     AND v_slot_ts < v_min_ts THEN
    RAISE EXCEPTION 'Selected slot % is too close to current time (30-min buffer required)', v_st;
  END IF;

  SELECT COUNT(*)::int INTO v_rostered
  FROM public.worker_availability wa
  JOIN public.workers w ON w.id = wa.worker_id
  WHERE wa.day_of_week = v_dow
    AND w.is_active = true
    AND NEW.service_type = ANY(w.service_types)
    AND NEW.community    = ANY(w.communities)
    AND wa.slots IS NOT NULL
    -- slots is text[] of slot labels like '06:00:00'; match either HH:MM or HH:MM:SS
    AND ((v_st || ':00') = ANY(wa.slots) OR v_st = ANY(wa.slots));

  SELECT COUNT(*)::int INTO v_booked
  FROM public.bookings b
  WHERE b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND b.scheduled_date = NEW.scheduled_date
    AND b.service_type   = NEW.service_type
    AND b.community      = NEW.community
    AND b.status IN ('pending','dispatched','accepted','assigned',
                     'confirmed','on_the_way','in_progress')
    AND b.scheduled_time = v_st::time;

  v_remaining := GREATEST(0, v_rostered - v_booked);

  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'No workers available for % on % at % (rostered=%, booked=%)',
      NEW.service_type, NEW.scheduled_date, v_st, v_rostered, v_booked;
  END IF;

  RETURN NEW;
END;
$$;

-- Verify
SELECT * FROM public.get_scheduled_slot_availability(
  'prestige-high-fields','maid', CURRENT_DATE
);
