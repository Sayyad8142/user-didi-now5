-- ============================================================================
-- RETIRE LEGACY dispatch_booking() RPC — UNBLOCK INSTANT BOOKING INSERTS
-- ============================================================================
-- Run this on the external Supabase project (paywwbuqycovjopryele) in the
-- SQL editor. It is idempotent and safe to re-run.
--
-- Problem:
--   public.dispatch_booking(uuid) was replaced with a stub that RAISES
--     'LEGACY_DISPATCH_DISABLED — dispatch_booking is retired. Use
--      dispatch-pending-bookings edge function.'
--   But two trigger functions still PERFORM that RPC inside the bookings
--   AFTER-INSERT path (notify_workers_fcm) and the preferred-timeout sweep
--   (sweep_preferred_timeouts). The exception aborts the booking INSERT.
--
-- Fix strategy:
--   1. Make dispatch_booking() a safe no-op that asynchronously kicks the
--      dispatch-pending-bookings edge function via pg_net. This unblocks
--      every legacy caller without touching trigger wiring.
--   2. Update notify_workers_fcm() and sweep_preferred_timeouts() to call
--      the edge function directly via pg_net (async, non-blocking) instead
--      of the legacy RPC. Preferred-worker logic is preserved.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Replace dispatch_booking() with a safe async kicker.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire-and-forget: hand off to the modern dispatcher. Never raise.
  BEGIN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true)
             || '/functions/v1/dispatch-pending-bookings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('booking_id', p_booking_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'dispatch_booking(%) async kick failed: %', p_booking_id, SQLERRM;
  END;
END;
$$;

COMMENT ON FUNCTION public.dispatch_booking(uuid) IS
  'Retired RPC kept as a safe shim: asynchronously invokes the dispatch-pending-bookings edge function via pg_net. Do NOT call from new code — call the edge function directly.';

-- ---------------------------------------------------------------------------
-- 2) notify_workers_fcm — keep preferred-worker FCM, remove legacy RPC.
-- ---------------------------------------------------------------------------
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

  -- Hand off to modern dispatcher (async, non-blocking, never raises).
  IF NOT v_preferred_eligible THEN
    BEGIN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url', true)
               || '/functions/v1/dispatch-pending-bookings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('booking_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'notify_workers_fcm dispatch kick failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) sweep_preferred_timeouts — async edge call instead of legacy RPC.
-- ---------------------------------------------------------------------------
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

    BEGIN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url', true)
               || '/functions/v1/dispatch-pending-bookings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('booking_id', v_req.booking_id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'sweep_preferred_timeouts dispatch kick failed for %: %', v_req.booking_id, SQLERRM;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- DONE. Verify with:
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('dispatch_booking','notify_workers_fcm','sweep_preferred_timeouts');
-- Then create a test instant booking — INSERT must succeed and a row should
-- appear in booking_requests within ~2s.
-- ---------------------------------------------------------------------------
