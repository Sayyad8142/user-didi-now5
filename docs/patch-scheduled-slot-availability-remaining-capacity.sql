-- =====================================================================
-- Patch: scheduled slot availability must reflect REMAINING capacity
-- Target DB: EXTERNAL Supabase (api.didisnow.com)
-- Apply with: psql "$EXTERNAL_DB_URL" -f docs/patch-scheduled-slot-availability-remaining-capacity.sql
--
-- Fixes:
--   1. get_scheduled_slot_availability returned rostered capacity
--      (ignored existing bookings) -> sold-out slots looked available.
--   2. validate_scheduled_booking_slot() used the same wrong formula
--      so the DB would happily accept overbooked scheduled slots.
--
-- New formula (mirrors Admin Slot Availability dashboard):
--   available = rostered workers (active, in community, service match,
--               roster slot matches day_of_week + slot time)
--               MINUS workers already holding an ACTIVE booking
--               for that community + service + date + slot
--   ACTIVE statuses: pending, dispatched, accepted, assigned,
--                    confirmed, on_the_way, in_progress
--
-- Today-safety buffer: for p_date = current_date, any slot whose
--   start is < now() + 30 minutes is forced to worker_count = 0.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_scheduled_slot_availability(
  p_community   text,
  p_service_type text,
  p_date        date
)
RETURNS TABLE(slot_time text, worker_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_dow         int;
  v_slot_start  text;
  v_slot_end    text;
  v_now         timestamptz := now();
  v_min_ts      timestamptz := now() + interval '30 minutes';
  v_is_today    boolean     := (p_date = (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  v_dow := extract(dow FROM p_date)::int;

  IF p_service_type = 'cook' THEN
    v_slot_start := '06:00:00';
    v_slot_end   := '21:00:00';
  ELSE
    v_slot_start := '06:00:00';
    v_slot_end   := '19:00:00';
  END IF;

  RETURN QUERY
  WITH time_slots AS (
    SELECT to_char(gs, 'HH24:MI')    AS st,
           to_char(gs, 'HH24:MI:SS') AS st_full,
           gs::timestamptz           AS slot_ts
    FROM generate_series(
      (p_date + v_slot_start::time) AT TIME ZONE 'Asia/Kolkata',
      (p_date + v_slot_end::time)   AT TIME ZONE 'Asia/Kolkata',
      interval '30 minutes'
    ) AS gs
  ),
  rostered AS (
    SELECT ts.st,
           ts.st_full,
           ts.slot_ts,
           w.id AS worker_id
    FROM time_slots ts
    JOIN worker_availability wa ON wa.day_of_week = v_dow
                               AND ts.st_full = ANY(wa.slots)
    JOIN workers w ON w.id = wa.worker_id
                  AND w.is_active = true
                  AND p_community     = ANY(w.communities)
                  AND p_service_type  = ANY(w.service_types)
  ),
  busy AS (
    -- Workers already holding an active booking for this community+service+date+slot
    SELECT b.worker_id,
           to_char(b.scheduled_time, 'HH24:MI') AS st
    FROM bookings b
    WHERE b.worker_id IS NOT NULL
      AND b.scheduled_date = p_date
      AND b.community      = p_community
      AND b.service_type   = p_service_type
      AND b.status IN (
        'pending','dispatched','accepted','assigned',
        'confirmed','on_the_way','in_progress'
      )
  )
  SELECT
    ts.st AS slot_time,
    CASE
      WHEN v_is_today AND ts.slot_ts < v_min_ts THEN 0
      ELSE COALESCE((
        SELECT count(DISTINCT r.worker_id)::int
        FROM rostered r
        WHERE r.st = ts.st
          AND r.worker_id NOT IN (
            SELECT bz.worker_id FROM busy bz WHERE bz.st = ts.st
          )
      ), 0)
    END AS worker_count
  FROM time_slots ts
  ORDER BY ts.st;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scheduled_slot_availability(text, text, date) TO authenticated, anon, service_role;


-- ---------------------------------------------------------------------
-- Server-side guard: reject inserts into sold-out slots, mirroring RPC.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_scheduled_booking_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_dow        int;
  v_slot_full  text;
  v_slot_short text;
  v_rostered   int;
  v_busy       int;
  v_remaining  int;
  v_slot_ts    timestamptz;
BEGIN
  IF NEW.booking_type <> 'scheduled'
     OR NEW.scheduled_date IS NULL
     OR NEW.scheduled_time IS NULL THEN
    RETURN NEW;
  END IF;

  v_dow        := extract(dow FROM NEW.scheduled_date)::int;
  v_slot_full  := lpad(NEW.scheduled_time::text, 8, '0');
  v_slot_short := substring(v_slot_full from 1 for 5);
  v_slot_ts    := (NEW.scheduled_date + NEW.scheduled_time) AT TIME ZONE 'Asia/Kolkata';

  -- 30-minute safety buffer for today
  IF v_slot_ts < (now() + interval '30 minutes') THEN
    RAISE EXCEPTION 'Selected slot is too close to start time. Please choose a later slot.';
  END IF;

  SELECT count(DISTINCT w.id) INTO v_rostered
  FROM workers w
  JOIN worker_availability wa ON wa.worker_id = w.id
  WHERE w.is_active = true
    AND NEW.community    = ANY(w.communities)
    AND NEW.service_type = ANY(w.service_types)
    AND wa.day_of_week   = v_dow
    AND v_slot_full      = ANY(wa.slots);

  SELECT count(DISTINCT b.worker_id) INTO v_busy
  FROM bookings b
  WHERE b.worker_id IS NOT NULL
    AND b.scheduled_date = NEW.scheduled_date
    AND b.community      = NEW.community
    AND b.service_type   = NEW.service_type
    AND to_char(b.scheduled_time, 'HH24:MI') = v_slot_short
    AND b.status IN (
      'pending','dispatched','accepted','assigned',
      'confirmed','on_the_way','in_progress'
    )
    AND (TG_OP <> 'UPDATE' OR b.id <> NEW.id);

  v_remaining := GREATEST(v_rostered - v_busy, 0);

  IF v_remaining < 1 THEN
    RAISE EXCEPTION 'No workers available for this slot. Please choose another time.';
  END IF;

  RETURN NEW;
END;
$$;
