-- ============================================================================
-- FIX: Scheduled bookings must send FCM notifications to workers
-- ============================================================================
-- ISSUE: Workers getting instant alerts for scheduled bookings
-- ROOT CAUSE: run_scheduled_prealerts() only sends Pushcut, not FCM to workers
-- FIX: Update run_scheduled_prealerts() to send FCM + create booking_requests
--
-- FLOW:
-- 1. Instant bookings → immediate FCM via triggers (already filtered correctly)
-- 2. Scheduled bookings → FCM only via run_scheduled_prealerts() 15 mins before
-- ============================================================================

-- Step 1: Create helper function to get available workers for a booking
CREATE OR REPLACE FUNCTION public.get_workers_for_notification(
  p_service_type text,
  p_community text
)
RETURNS TABLE(
  worker_id uuid,
  fcm_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id as worker_id,
    w.fcm_token
  FROM public.workers w
  WHERE w.is_active = true
    AND w.is_available = true
    AND p_service_type = ANY(w.service_types)
    AND (p_community = ANY(w.communities) OR w.community = p_community)
    AND w.fcm_token IS NOT NULL
  ORDER BY 
    COALESCE(w.rating, 0) DESC,
    w.last_active_at DESC
  LIMIT 20;
END;
$$;

-- Step 2: Create function to send FCM notification via HTTP to Firebase
CREATE OR REPLACE FUNCTION public.send_fcm_to_worker(
  p_fcm_token text,
  p_booking_id uuid,
  p_service_type text,
  p_community text,
  p_flat_no text,
  p_customer_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fcm_url text := 'https://fcm.googleapis.com/v1/projects/didi-now-worker-7b4cb/messages:send';
  v_server_key text;
  v_payload jsonb;
  v_resp http_response;
BEGIN
  -- Get FCM server key from ops_settings
  SELECT value INTO v_server_key FROM public.ops_settings WHERE key = 'fcm_server_key';
  
  IF v_server_key IS NULL OR v_server_key = '' THEN
    RAISE NOTICE 'FCM server key not configured';
    RETURN false;
  END IF;

  -- Build FCM payload with BOOKING_ALERT notification type
  v_payload := jsonb_build_object(
    'message', jsonb_build_object(
      'token', p_fcm_token,
      'notification', jsonb_build_object(
        'title', 'New Booking Available',
        'body', initcap(p_service_type) || ' • ' || p_community || ' ' || p_flat_no
      ),
      'data', jsonb_build_object(
        'type', 'BOOKING_ALERT',
        'booking_id', p_booking_id::text,
        'service_type', p_service_type,
        'community', p_community,
        'flat_no', p_flat_no,
        'customer_name', p_customer_name
      ),
      'android', jsonb_build_object(
        'priority', 'high',
        'notification', jsonb_build_object(
          'sound', 'default',
          'priority', 'high'
        )
      )
    )
  );

  -- Send FCM notification
  BEGIN
    SELECT http_post(
      v_fcm_url,
      v_payload::text,
      ARRAY[
        http_header('Authorization', 'Bearer ' || v_server_key),
        http_header('Content-Type', 'application/json')
      ]
    ) INTO v_resp;
    
    RETURN (v_resp.status BETWEEN 200 AND 299);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FCM send failed: %', SQLERRM;
    RETURN false;
  END;
END;
$$;

-- Step 3: Update run_scheduled_prealerts to send FCM to workers
CREATE OR REPLACE FUNCTION public.run_scheduled_prealerts(p_window_minutes integer DEFAULT 15)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pushcut_url text;
  v_admin_url text;
  rec record;
  worker_rec record;
  v_scheduled_ts timestamptz;
  v_resp http_response;
  v_workers_notified int := 0;
BEGIN
  -- Get settings
  SELECT value INTO v_pushcut_url FROM public.ops_settings WHERE key='pushcut_booking_url';
  SELECT value INTO v_admin_url FROM public.ops_settings WHERE key='admin_open_url';

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
    v_workers_notified := 0;

    -- Send Pushcut notification (admin notification)
    IF v_pushcut_url IS NOT NULL AND v_pushcut_url <> '' THEN
      BEGIN
        SELECT http_post(
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
        ) INTO v_resp;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Pushcut notification failed: %', SQLERRM;
      END;
    END IF;

    -- CRITICAL: Send FCM notifications to available workers
    FOR worker_rec IN
      SELECT * FROM get_workers_for_notification(rec.service_type, rec.community)
    LOOP
      -- Send FCM to each available worker
      IF send_fcm_to_worker(
        worker_rec.fcm_token,
        rec.id,
        rec.service_type,
        rec.community,
        rec.flat_no,
        rec.cust_name
      ) THEN
        v_workers_notified := v_workers_notified + 1;
        
        -- Create booking_request record for tracking
        INSERT INTO public.booking_requests (
          booking_id,
          worker_id,
          order_sequence,
          status,
          offered_at,
          timeout_at
        ) VALUES (
          rec.id,
          worker_rec.worker_id,
          v_workers_notified,
          'notified',
          now(),
          now() + interval '5 minutes'
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- Mark as alerted (prevents spam even if notifications fail)
    UPDATE public.bookings
      SET prealert_sent = true,
          updated_at = now()
      WHERE id = rec.id;

    RAISE NOTICE 'Scheduled booking % prealert sent to % workers', rec.id, v_workers_notified;
  END LOOP;
END;
$$;

-- Step 4: Verify cron job is running every minute
SELECT cron.unschedule('didinow_prealerts_every_5min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'didinow_prealerts_every_5min');
SELECT cron.unschedule('didinow_prealerts_every_minute') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'didinow_prealerts_every_minute');

SELECT cron.schedule(
  'didinow_prealerts_every_minute',
  '* * * * *',
  'SELECT public.run_scheduled_prealerts(15);'
);

-- Step 5: Add comments for documentation
COMMENT ON FUNCTION public.run_scheduled_prealerts(integer) IS 
'Processes scheduled bookings and sends FCM notifications to workers when they are within the specified window (default 15 minutes) of their scheduled time. This is the ONLY function that should notify workers about scheduled bookings. Instant bookings are handled by triggers immediately on insert.';

COMMENT ON FUNCTION public.get_workers_for_notification(text, text) IS
'Returns available workers eligible for a booking based on service type and community. Used by run_scheduled_prealerts() to get worker FCM tokens.';

COMMENT ON FUNCTION public.send_fcm_to_worker(text, uuid, text, text, text, text) IS
'Sends FCM notification to a single worker with BOOKING_ALERT payload. Returns true if successful.';