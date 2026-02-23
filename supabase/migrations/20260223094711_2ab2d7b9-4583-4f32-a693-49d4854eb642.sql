
-- Polish dispatch_booking: bigint lock key, incremental order_sequence, batch limit 5
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
  v_lock_key BIGINT;
  v_seq INT := 0;
BEGIN
  v_lock_key := hashtextextended(p_booking_id::text, 0);

  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RAISE LOG 'dispatch_booking: Could not acquire lock for booking %, skipping', p_booking_id;
    RETURN;
  END IF;

  BEGIN
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RETURN;
    END IF;

    IF v_booking.status NOT IN ('pending', 'confirmed') OR v_booking.worker_id IS NOT NULL THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM booking_requests br WHERE br.booking_id = p_booking_id AND br.status = 'accepted') THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RETURN;
    END IF;

    -- Get current max order_sequence for this booking
    SELECT COALESCE(MAX(br.order_sequence), 0) INTO v_seq
    FROM booking_requests br WHERE br.booking_id = p_booking_id;

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
      ORDER BY w.last_seen_at DESC NULLS LAST, w.rating DESC NULLS LAST, w.total_bookings_completed DESC NULLS LAST
      LIMIT 5
    LOOP
      v_seq := v_seq + 1;

      INSERT INTO booking_requests (booking_id, worker_id, order_sequence, timeout_at, status, notification_status)
      VALUES (p_booking_id, v_worker.id, v_seq, now() + interval '45 seconds', 'pending', 'sent')
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

    PERFORM pg_advisory_unlock(v_lock_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION public.dispatch_booking(uuid) IS 
'Dispatches a booking to top 5 eligible workers via FCM. Uses bigint advisory lock, incremental order_sequence, and ON CONFLICT for idempotency.';
