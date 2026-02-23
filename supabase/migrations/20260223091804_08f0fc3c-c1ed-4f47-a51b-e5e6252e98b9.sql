
-- ============================================================================
-- CRITICAL FIX: Preferred worker fallback dispatch
-- 
-- Problem: notify_workers_fcm only fires ON INSERT. When a preferred worker
-- times out after 45s, no fallback dispatch happens → bookings get stuck.
--
-- Solution:
-- 1. Create reusable dispatch_booking(p_booking_id) function
-- 2. Create sweep_preferred_timeouts() that finds expired preferred requests
--    and triggers normal dispatch
-- 3. Refactor notify_workers_fcm to use dispatch_booking internally
-- ============================================================================

-- Step 1: Create reusable dispatch function
CREATE OR REPLACE FUNCTION public.dispatch_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking RECORD;
  v_worker RECORD;
  v_token TEXT;
  v_body TEXT;
  v_data JSONB;
BEGIN
  -- Get booking details
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE LOG 'dispatch_booking: Booking % not found', p_booking_id;
    RETURN;
  END IF;

  -- Only dispatch pending/instant bookings
  IF v_booking.status NOT IN ('pending', 'confirmed') THEN
    RAISE LOG 'dispatch_booking: Booking % status is %, skipping', p_booking_id, v_booking.status;
    RETURN;
  END IF;

  v_body := v_booking.service_type || ' • ' || v_booking.community || ' • Flat ' || COALESCE(v_booking.flat_no, '');
  v_data := jsonb_build_object(
    'type', 'BOOKING_ALERT',
    'booking_id', v_booking.id,
    'service_type', v_booking.service_type,
    'community', v_booking.community,
    'flat_no', COALESCE(v_booking.flat_no, ''),
    'customer_name', COALESCE(v_booking.cust_name, '')
  );

  -- Notify all eligible workers, excluding any who already have a timed_out/rejected request for this booking
  FOR v_worker IN
    SELECT w.id, w.full_name
    FROM workers w
    WHERE w.is_active = true
      AND w.is_available = true
      AND w.is_busy = false
      AND v_booking.service_type = ANY(w.service_types)
      AND (
        w.communities IS NULL
        OR array_length(w.communities, 1) IS NULL
        OR v_booking.community = ANY(w.communities)
      )
      -- Exclude workers who already have a request for this booking (timed_out, rejected, or pending)
      AND NOT EXISTS (
        SELECT 1 FROM booking_requests br
        WHERE br.booking_id = p_booking_id
          AND br.worker_id = w.id
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
      RAISE LOG 'dispatch_booking: Sent FCM to worker % for booking %', v_worker.full_name, p_booking_id;
    END IF;
  END LOOP;
END;
$$;

-- Step 2: Create sweep function for preferred worker timeouts
CREATE OR REPLACE FUNCTION public.sweep_preferred_timeouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req RECORD;
  v_count integer := 0;
BEGIN
  -- Find all expired preferred worker booking_requests
  -- A preferred request is identified by: booking has preferred_worker_id, 
  -- request is pending, and timeout_at has passed
  FOR v_req IN
    SELECT br.id AS request_id, br.booking_id, br.worker_id
    FROM booking_requests br
    JOIN bookings b ON b.id = br.booking_id
    WHERE br.status = 'pending'
      AND br.timeout_at < now()
      AND b.preferred_worker_id IS NOT NULL
      AND b.preferred_worker_id = br.worker_id
      AND b.status = 'pending'
  LOOP
    -- Mark the request as timed_out
    UPDATE booking_requests
    SET status = 'timed_out', responded_at = now()
    WHERE id = v_req.request_id;

    -- Clear preferred_worker_id and reset dispatch_status so normal dispatch can proceed
    UPDATE bookings
    SET preferred_worker_id = NULL,
        dispatch_status = 'pending'
    WHERE id = v_req.booking_id;

    -- Immediately trigger normal dispatch for this booking
    PERFORM public.dispatch_booking(v_req.booking_id);

    v_count := v_count + 1;
    RAISE LOG 'sweep_preferred_timeouts: Timed out preferred request % for booking %, triggered fallback dispatch', v_req.request_id, v_req.booking_id;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Step 3: Update notify_workers_fcm to use dispatch_booking for normal dispatch path
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

  -- If preferred_worker_id is set, check if that worker is currently eligible
  IF NEW.preferred_worker_id IS NOT NULL THEN
    v_body := NEW.service_type || ' • ' || NEW.community || ' • Flat ' || COALESCE(NEW.flat_no, '');
    v_data := jsonb_build_object(
      'type', 'BOOKING_ALERT',
      'booking_id', NEW.id,
      'service_type', NEW.service_type,
      'community', NEW.community,
      'flat_no', COALESCE(NEW.flat_no, ''),
      'customer_name', COALESCE(NEW.cust_name, '')
    );

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

        INSERT INTO booking_requests (booking_id, worker_id, order_sequence, status, timeout_at, offered_at)
        VALUES (NEW.id, v_worker.id, 1, 'pending', now() + interval '45 seconds', now())
        ON CONFLICT DO NOTHING;

        v_preferred_eligible := true;
        RAISE LOG 'notify_workers_fcm: Preferred worker % notified for booking %, fallback sweep will handle timeout', v_worker.full_name, NEW.id;
      END IF;
    END IF;

    IF NOT v_preferred_eligible THEN
      RAISE LOG 'notify_workers_fcm: Preferred worker not eligible for booking %, falling back to normal dispatch', NEW.id;
      -- Clear preferred_worker_id since worker isn't eligible
      UPDATE bookings SET preferred_worker_id = NULL WHERE id = NEW.id;
    END IF;
  END IF;

  -- Normal dispatch: notify all eligible workers (skip if preferred worker was notified)
  IF NOT v_preferred_eligible THEN
    PERFORM public.dispatch_booking(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Step 4: Create edge function for the cron sweep (handled via cron calling RPC)
-- Schedule sweep_preferred_timeouts to run every 30 seconds via pg_cron
-- pg_cron minimum interval is 1 minute, so we run every minute
SELECT cron.unschedule('sweep_preferred_timeouts') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep_preferred_timeouts');

SELECT cron.schedule(
  'sweep_preferred_timeouts',
  '* * * * *',
  $$SELECT public.sweep_preferred_timeouts();$$
);

COMMENT ON FUNCTION public.dispatch_booking(uuid) IS 
'Reusable function to dispatch a booking to all eligible workers via FCM. Excludes workers who already have booking_requests for this booking.';

COMMENT ON FUNCTION public.sweep_preferred_timeouts() IS 
'Cron-called function that finds expired preferred worker booking_requests, marks them as timed_out, clears preferred_worker_id, and triggers normal dispatch via dispatch_booking(). Runs every minute to ensure no booking gets stuck.';
