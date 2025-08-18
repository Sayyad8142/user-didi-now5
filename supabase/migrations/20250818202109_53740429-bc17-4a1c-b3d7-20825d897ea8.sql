-- Fix the function search path security issue by fully qualifying all references
-- Keep extensions in public schema but fix the function security issue

CREATE OR REPLACE FUNCTION public.run_scheduled_prealerts(p_window_minutes int DEFAULT 15)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pushcut_url text;
  v_admin_url   text;
  rec record;
  v_scheduled_ts timestamptz;
  v_resp public.http_response;
BEGIN
  -- Get settings with fully qualified schema names
  SELECT value INTO v_pushcut_url FROM public.ops_settings WHERE key='pushcut_booking_url';
  SELECT value INTO v_admin_url FROM public.ops_settings WHERE key='admin_open_url';

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
    WHERE scheduled_ts >= pg_catalog.now()
      AND scheduled_ts < pg_catalog.now() + pg_catalog.make_interval(mins => p_window_minutes)
    ORDER BY scheduled_ts ASC
  LOOP
    v_scheduled_ts := rec.scheduled_ts;

    -- Send Pushcut notification using fully qualified function name
    SELECT public.http_post(
      v_pushcut_url,
      pg_catalog.json_build_object(
        'title', 'Scheduled booking due soon',
        'text',  pg_catalog.initcap(COALESCE(rec.service_type, 'service')) || ' • ' ||
                 COALESCE(rec.community, '') || ' ' || COALESCE(rec.flat_no, '') ||
                 E'\nAt: ' || pg_catalog.to_char(v_scheduled_ts AT TIME ZONE 'Asia/Kolkata', 'HH24:MI DD-Mon'),
        'url',   CASE WHEN v_admin_url IS NULL OR v_admin_url = '' THEN null
                      ELSE v_admin_url || '?b=' || rec.id END
      )::text,
      'application/json'
    ) INTO v_resp;

    -- Mark as alerted (prevents spam even if Pushcut returns non-200)
    UPDATE public.bookings
      SET prealert_sent = true
      WHERE id = rec.id;
  END LOOP;
END
$$;