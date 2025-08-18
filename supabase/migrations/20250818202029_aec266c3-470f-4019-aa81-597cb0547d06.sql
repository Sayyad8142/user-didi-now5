-- Fix security issues from the scheduled reminder migration

-- 1) Create extensions schema and move extensions out of public
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move http and pg_cron extensions to extensions schema
ALTER EXTENSION http SET SCHEMA extensions;
ALTER EXTENSION pg_cron SET SCHEMA extensions;

-- 2) Update the scheduled prealerts function with proper search_path and schema qualification
CREATE OR REPLACE FUNCTION public.run_scheduled_prealerts(p_window_minutes int DEFAULT 15)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pushcut_url text := (SELECT value FROM public.ops_settings WHERE key='pushcut_booking_url');
  v_admin_url   text := (SELECT value FROM public.ops_settings WHERE key='admin_open_url');
  rec record;
  v_scheduled_ts timestamptz;
  v_resp extensions.http_response;
BEGIN
  IF v_pushcut_url IS NULL OR v_pushcut_url = '' THEN
    -- No Pushcut URL configured, nothing to send
    RETURN;
  END IF;

  -- Loop through scheduled bookings that are pending, not alerted yet, and due within the window
  FOR rec IN
    WITH due AS (
      SELECT
        b.*,
        -- Build local (Asia/Kolkata) timestamp from separate date + time columns
        ((b.scheduled_date::date + b.scheduled_time)::timestamp AT TIME ZONE 'Asia/Kolkata') AS scheduled_ts
      FROM public.bookings b
      WHERE b.booking_type = 'scheduled'
        AND b.status = 'pending'
        AND COALESCE(b.prealert_sent, false) = false
        AND b.scheduled_date IS NOT NULL
        AND b.scheduled_time IS NOT NULL
    )
    SELECT *
    FROM due
    WHERE scheduled_ts >= now()
      AND scheduled_ts < now() + make_interval(mins => p_window_minutes)
    ORDER BY scheduled_ts ASC
  LOOP
    v_scheduled_ts := rec.scheduled_ts;

    -- Send Pushcut notification (don't override sound, let Pushcut choose)
    v_resp := extensions.http_post(
      v_pushcut_url,
      json_build_object(
        'title', 'Scheduled booking due soon',
        'text',  initcap(COALESCE(rec.service_type, 'service')) || ' • ' ||
                 COALESCE(rec.community, '') || ' ' || COALESCE(rec.flat_no, '') ||
                 E'\nAt: ' || to_char(v_scheduled_ts AT TIME ZONE 'Asia/Kolkata', 'HH24:MI DD-Mon'),
        'url',   CASE WHEN v_admin_url IS NULL OR v_admin_url = '' THEN null
                      ELSE v_admin_url || '?b=' || rec.id END
      )::text,
      'application/json'
    );

    -- Mark as alerted (prevents spam even if Pushcut returns non-200)
    UPDATE public.bookings
      SET prealert_sent = true
      WHERE id = rec.id;
  END LOOP;
END
$$;

-- 3) Update the cron job to use the extensions schema
SELECT extensions.cron.unschedule('didinow_prealerts_every_5min');
SELECT extensions.cron.schedule(
  'didinow_prealerts_every_5min',
  '*/5 * * * *',
  $$SELECT public.run_scheduled_prealerts(15);$$
);