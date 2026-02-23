
-- 1) Harden dispatch_booking with advisory lock + ON CONFLICT + safety checks
CREATE OR REPLACE FUNCTION public.dispatch_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_worker RECORD;
  v_token TEXT;
  v_body TEXT;
  v_data JSONB;
  v_lock_acquired BOOLEAN;
BEGIN
  v_lock_acquired := pg_try_advisory_lock(hashtext(p_booking_id::text));
  IF NOT v_lock_acquired THEN
    RAISE LOG 'dispatch_booking: Could not acquire lock for booking %, skipping', p_booking_id;
    RETURN;
  END IF;

  BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
      PERFORM pg_advisory_unlock(hashtext(p_booking_id::text));
      RETURN;
    END IF;

    IF v_booking.status NOT IN ('pending', 'confirmed') OR v_booking.worker_id IS NOT NULL THEN
      PERFORM pg_advisory_unlock(hashtext(p_booking_id::text));
      RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM booking_requests br WHERE br.booking_id = p_booking_id AND br.status = 'accepted') THEN
      PERFORM pg_advisory_unlock(hashtext(p_booking_id::text));
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

    FOR v_worker IN
      SELECT w.id, w.full_name
      FROM workers w
      WHERE w.is_active = true
        AND w.is_available = true
        AND w.is_busy = false
        AND v_booking.service_type = ANY(w.service_types)
        AND (w.communities IS NULL OR array_length(w.communities, 1) IS NULL OR v_booking.community = ANY(w.communities))
        AND NOT EXISTS (SELECT 1 FROM booking_requests br WHERE br.booking_id = p_booking_id AND br.worker_id = w.id)
    LOOP
      INSERT INTO booking_requests (booking_id, worker_id, order_sequence, timeout_at, status, notification_status)
      VALUES (p_booking_id, v_worker.id, 1, now() + interval '45 seconds', 'pending', 'sent')
      ON CONFLICT (booking_id, worker_id) DO NOTHING;

      SELECT token INTO v_token FROM fcm_tokens WHERE user_id = v_worker.id;
      IF v_token IS NOT NULL THEN
        PERFORM net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-worker-fcm',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)),
          body := jsonb_build_object('token', v_token, 'title', 'New Booking', 'body', v_body, 'data', v_data)
        );
      END IF;
    END LOOP;

    PERFORM pg_advisory_unlock(hashtext(p_booking_id::text));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(hashtext(p_booking_id::text));
    RAISE;
  END;
END;
$$;

-- 2) Update notify_workers_fcm with 15s preferred timeout + ON CONFLICT
CREATE OR REPLACE FUNCTION public.notify_workers_fcm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker RECORD;
  v_token TEXT;
  v_body TEXT;
  v_data JSONB;
  v_preferred_eligible BOOLEAN := false;
BEGIN
  IF NEW.booking_type <> 'instant' THEN
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

  IF NEW.preferred_worker_id IS NOT NULL THEN
    SELECT w.id, w.full_name INTO v_worker
    FROM workers w
    WHERE w.id = NEW.preferred_worker_id
      AND w.is_active = true AND w.is_available = true AND w.is_busy = false
      AND NEW.service_type = ANY(w.service_types)
      AND (w.communities IS NULL OR array_length(w.communities, 1) IS NULL OR NEW.community = ANY(w.communities));

    IF FOUND THEN
      INSERT INTO booking_requests (booking_id, worker_id, order_sequence, timeout_at, status, notification_status)
      VALUES (NEW.id, v_worker.id, 1, now() + interval '15 seconds', 'pending', 'sent')
      ON CONFLICT (booking_id, worker_id) DO NOTHING;

      SELECT token INTO v_token FROM fcm_tokens WHERE user_id = v_worker.id;
      IF v_token IS NOT NULL THEN
        PERFORM net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-worker-fcm',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)),
          body := jsonb_build_object('token', v_token, 'title', 'New Booking', 'body', v_body, 'data', v_data)
        );
      END IF;
      v_preferred_eligible := true;
    ELSE
      UPDATE bookings SET preferred_worker_id = NULL WHERE id = NEW.id;
    END IF;
  END IF;

  IF NOT v_preferred_eligible THEN
    PERFORM public.dispatch_booking(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Harden sweep with safety checks (skip if already assigned/accepted)
CREATE OR REPLACE FUNCTION public.sweep_preferred_timeouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_count integer := 0;
BEGIN
  FOR v_req IN
    SELECT br.id AS request_id, br.booking_id, br.worker_id
    FROM booking_requests br
    JOIN bookings b ON b.id = br.booking_id
    WHERE br.status = 'pending'
      AND br.timeout_at < now()
      AND b.preferred_worker_id IS NOT NULL
      AND b.preferred_worker_id = br.worker_id
      AND b.status = 'pending'
      AND b.worker_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM booking_requests br2 WHERE br2.booking_id = b.id AND br2.status = 'accepted')
  LOOP
    UPDATE booking_requests SET status = 'timed_out', responded_at = now() WHERE id = v_req.request_id;
    UPDATE bookings SET preferred_worker_id = NULL, dispatch_status = 'pending' WHERE id = v_req.booking_id;
    PERFORM public.dispatch_booking(v_req.booking_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
