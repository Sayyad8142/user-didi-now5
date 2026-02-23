
-- 1) Add preferred_worker_id column to bookings
ALTER TABLE public.bookings
  ADD COLUMN preferred_worker_id uuid REFERENCES public.workers(id);

-- 2) Create RPC: get_eligible_workers for instant booking worker selection
CREATE OR REPLACE FUNCTION public.get_eligible_workers(
  p_service text,
  p_community text,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  worker_id uuid,
  full_name text,
  photo_url text,
  rating_avg numeric,
  rating_count int,
  completed_bookings_count int,
  last_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    w.id AS worker_id,
    w.full_name,
    w.photo_url,
    COALESCE(w.rating, 5.0) AS rating_avg,
    COALESCE(w.total_ratings, 0) AS rating_count,
    COALESCE(w.total_bookings_completed, 0) AS completed_bookings_count,
    w.last_seen_at
  FROM workers w
  WHERE w.is_active = true
    AND w.is_available = true
    AND w.is_busy = false
    AND p_service = ANY(w.service_types)
    AND (
      w.communities IS NULL
      OR array_length(w.communities, 1) IS NULL
      OR p_community = ANY(w.communities)
    )
    AND w.last_seen_at >= (now() - interval '3 minutes')
  ORDER BY
    COALESCE(w.rating, 5.0) DESC,
    COALESCE(w.total_bookings_completed, 0) DESC,
    w.last_seen_at DESC NULLS LAST
  LIMIT p_limit;
$$;

-- 3) Update the instant booking dispatch trigger to handle preferred_worker_id
-- The notify_workers_fcm trigger already fires on insert. We update it to:
-- - If preferred_worker_id is set AND that worker is eligible, only notify that worker first
-- - Otherwise, normal dispatch to all eligible workers
CREATE OR REPLACE FUNCTION public.notify_workers_fcm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_worker RECORD;
  v_token TEXT;
  v_body TEXT;
  v_data JSONB;
  v_preferred_eligible BOOLEAN := false;
BEGIN
  -- Only trigger for instant bookings
  IF NEW.booking_type != 'instant' THEN
    RETURN NEW;
  END IF;

  v_body := NEW.service_type || ' • ' || NEW.community || ' • Flat ' || COALESCE(NEW.flat_no, '');
  v_data := jsonb_build_object(
    'type', 'BOOKING_ALERT',
    'booking_id', NEW.id,
    'service_type', NEW.service_type,
    'community', NEW.community,
    'flat_no', COALESCE(NEW.flat_no, ''),
    'customer_name', COALESCE(NEW.cust_name, '')
  );

  -- If preferred_worker_id is set, check if that worker is currently eligible
  IF NEW.preferred_worker_id IS NOT NULL THEN
    SELECT INTO v_worker w.id, w.full_name
    FROM workers w
    WHERE w.id = NEW.preferred_worker_id
      AND w.is_active = true
      AND w.is_available = true
      AND w.is_busy = false
      AND NEW.service_type = ANY(w.service_types)
      AND (
        w.communities IS NULL
        OR array_length(w.communities, 1) IS NULL
        OR NEW.community = ANY(w.communities)
      );

    IF FOUND THEN
      -- Get FCM token for preferred worker
      SELECT token INTO v_token FROM fcm_tokens WHERE user_id = v_worker.id;
      
      IF v_token IS NOT NULL THEN
        -- Send FCM only to preferred worker
        PERFORM net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-worker-fcm',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := jsonb_build_object(
            'token', v_token,
            'title', 'New Booking',
            'body', v_body,
            'data', v_data
          )
        );

        -- Create booking_request only for preferred worker with short timeout
        INSERT INTO booking_requests (booking_id, worker_id, order_sequence, status, timeout_at, offered_at)
        VALUES (NEW.id, v_worker.id, 1, 'pending', now() + interval '45 seconds', now())
        ON CONFLICT DO NOTHING;

        v_preferred_eligible := true;
        RAISE LOG 'notify_workers_fcm: Preferred worker % notified for booking %', v_worker.full_name, NEW.id;
      END IF;
    END IF;

    -- If preferred worker not eligible, fall through to normal dispatch
    IF NOT v_preferred_eligible THEN
      RAISE LOG 'notify_workers_fcm: Preferred worker not eligible for booking %, falling back to normal dispatch', NEW.id;
    END IF;
  END IF;

  -- Normal dispatch: notify all eligible workers (skip if preferred worker was notified)
  IF NOT v_preferred_eligible THEN
    FOR v_worker IN
      SELECT w.id, w.full_name
      FROM workers w
      WHERE w.is_active = true
        AND w.is_available = true
        AND w.is_busy = false
        AND NEW.service_type = ANY(w.service_types)
        AND (
          w.communities IS NULL
          OR array_length(w.communities, 1) IS NULL
          OR NEW.community = ANY(w.communities)
        )
    LOOP
      SELECT token INTO v_token FROM fcm_tokens WHERE user_id = v_worker.id;
      IF v_token IS NOT NULL THEN
        PERFORM net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-worker-fcm',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := jsonb_build_object(
            'token', v_token,
            'title', 'New Booking',
            'body', v_body,
            'data', v_data
          )
        );
        RAISE LOG 'notify_workers_fcm: Sent FCM to worker % for booking %', v_worker.full_name, NEW.id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
