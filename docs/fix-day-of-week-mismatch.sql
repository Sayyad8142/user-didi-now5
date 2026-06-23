-- =============================================================================
-- Fix: day_of_week mismatch between worker app (Mon=0..Sun=6) and
--      PostgreSQL extract(dow ...) (Sun=0..Sat=6).
--
-- Symptom: Worker roster saved for Saturday appears in user app under Friday.
--
-- Affected functions (all replaced in this migration):
--   1. public.get_scheduled_slot_availability(text, text, date)
--   2. public.validate_scheduled_booking_slot()        (trigger fn on bookings)
--   3. public.get_online_workers_count(text)
--   4. public.get_eligible_workers(text, text, int)
--
-- Conversion applied in every function:
--   v_dow := (extract(dow FROM <date|now>)::int + 6) % 7;
--
-- Run on EXTERNAL Supabase (api.didisnow.com) as a service-role user.
-- Idempotent: each statement uses CREATE OR REPLACE.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) get_scheduled_slot_availability
--    Used by: src/features/booking/ScheduleScreen.tsx (slot allowlist).
--    Latest prior definition: migration 20260222232139.
--    Change: line `v_dow := extract(dow FROM p_date)::int;`
--         -> `v_dow := (extract(dow FROM p_date)::int + 6) % 7;`
-- -----------------------------------------------------------------------------
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
  -- Convert PG dow (Sun=0..Sat=6) to worker-app dow (Mon=0..Sun=6)
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

-- -----------------------------------------------------------------------------
-- 2) validate_scheduled_booking_slot  (BEFORE INSERT/UPDATE trigger on bookings)
--    Latest prior definition: migration 20260304203024.
--    Change: same v_dow conversion.
-- -----------------------------------------------------------------------------
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
  IF NEW.booking_type != 'scheduled'
     OR NEW.scheduled_date IS NULL
     OR NEW.scheduled_time IS NULL THEN
    RETURN NEW;
  END IF;

  -- Convert PG dow (Sun=0..Sat=6) to worker-app dow (Mon=0..Sun=6)
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

  IF v_count < v_min_workers THEN
    RAISE EXCEPTION 'Slot unavailable: No workers are available at this time. Please choose another time slot.';
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) get_online_workers_count
--    Used by: src/hooks/useOnlineWorkerCounts.ts (home live counters).
--    Latest prior definition: migration 20260303132321.
--    Change: same v_dow conversion against now() AT TIME ZONE 'Asia/Kolkata'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_online_workers_count(p_community text)
RETURNS TABLE(service text, online_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now() AT TIME ZONE 'Asia/Kolkata';
  -- Convert PG dow (Sun=0..Sat=6) to worker-app dow (Mon=0..Sun=6)
  v_dow int := (EXTRACT(DOW FROM v_now)::int + 6) % 7;
  v_current_slot text := to_char(
    date_trunc('hour', v_now::time)
    + (floor(EXTRACT(MINUTE FROM v_now::time) / 30) * interval '30 minutes'),
    'HH24:MI:SS'
  );
BEGIN
  RETURN QUERY
  SELECT
    svc AS service,
    count(DISTINCT w.id) AS online_count
  FROM workers w
  CROSS JOIN unnest(w.service_types) AS svc
  INNER JOIN worker_availability wa
    ON wa.worker_id = w.id
    AND wa.day_of_week = v_dow
    AND v_current_slot = ANY(wa.slots)
  WHERE p_community = ANY(w.communities)
    AND w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
  GROUP BY svc;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) get_eligible_workers
--    Used by: instant-booking eligible-pool reads.
--    Latest prior definition: migration 20260223100850.
--    Change: same v_dow conversion against now() AT TIME ZONE 'Asia/Kolkata'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_eligible_workers(
  p_service   text,
  p_community text,
  p_limit     int DEFAULT 50
)
RETURNS TABLE(
  worker_id uuid,
  full_name text,
  photo_url text,
  rating_avg numeric,
  rating_count int,
  completed_bookings_count int,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow  int;
  v_slot text;
BEGIN
  -- Convert PG dow (Sun=0..Sat=6) to worker-app dow (Mon=0..Sun=6)
  v_dow := (extract(dow FROM now() AT TIME ZONE 'Asia/Kolkata')::int + 6) % 7;
  v_slot := to_char(
    date_trunc('hour', now() AT TIME ZONE 'Asia/Kolkata')
    + interval '30 min'
      * floor(extract(minute FROM now() AT TIME ZONE 'Asia/Kolkata') / 30),
    'HH24:MI:SS'
  );

  RETURN QUERY
  SELECT
    w.id                                            AS worker_id,
    w.full_name,
    w.photo_url,
    COALESCE(w.rating, 5.0)                         AS rating_avg,
    COALESCE(w.total_ratings, 0)::int               AS rating_count,
    COALESCE(w.total_bookings_completed, 0)::int    AS completed_bookings_count,
    w.last_seen_at
  FROM workers w
  JOIN worker_availability wa ON wa.worker_id = w.id
  WHERE w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
    AND p_service = ANY(w.service_types)
    AND (
      w.communities IS NULL
      OR array_length(w.communities, 1) IS NULL
      OR p_community = ANY(w.communities)
    )
    AND wa.day_of_week = v_dow
    AND v_slot = ANY(wa.slots)
  ORDER BY
    COALESCE(w.rating, 5.0) DESC,
    COALESCE(w.total_bookings_completed, 0) DESC,
    w.last_seen_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

COMMIT;

-- =============================================================================
-- OPTIONAL AUDIT (read-only) — run separately after the migration commits.
-- Lists future scheduled bookings whose slot is NOT covered by the worker
-- roster under the corrected day-of-week mapping. These were let through by
-- the old trigger and may need manual review / re-scheduling.
-- =============================================================================
-- SELECT b.id, b.user_id, b.community, b.service_type,
--        b.scheduled_date, b.scheduled_time, b.status
-- FROM public.bookings b
-- WHERE b.booking_type = 'scheduled'
--   AND b.scheduled_date >= current_date
--   AND b.status IN ('pending','dispatched','accepted','confirmed','on_the_way')
--   AND NOT EXISTS (
--     SELECT 1
--     FROM public.workers w
--     JOIN public.worker_availability wa ON wa.worker_id = w.id
--     WHERE w.is_active = true
--       AND b.community = ANY(w.communities)
--       AND b.service_type = ANY(w.service_types)
--       AND wa.day_of_week = (extract(dow FROM b.scheduled_date)::int + 6) % 7
--       AND lpad(b.scheduled_time::text, 8, '0') = ANY(wa.slots)
--   )
-- ORDER BY b.scheduled_date, b.scheduled_time;
