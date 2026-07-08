-- =====================================================================
-- FIX: "null value in column url of relation http_request_queue"
--      when booking with a Preferred / Favourite worker.
-- =====================================================================
-- Run this on the EXTERNAL DB (api.didisnow.com) in the SQL editor.
-- Safe to re-run. Idempotent.
--
-- ROOT CAUSE
-- ----------
-- The AFTER-INSERT trigger notify_workers_fcm() has a branch that fires
-- when NEW.preferred_worker_id IS NOT NULL. That branch calls
--
--     PERFORM net.http_post(
--       url := current_setting('app.settings.supabase_url', true)
--              || '/functions/v1/send-worker-fcm',
--       ...
--     );
--
-- WITHOUT a BEGIN/EXCEPTION guard. If the GUC `app.settings.supabase_url`
-- is not set on this database (or is temporarily NULL after a restore /
-- role switch), the concatenation is NULL, pg_net rejects the row with
-- NOT NULL violation on `net.http_request_queue.url`, and the exception
-- aborts the whole booking INSERT — so payment is captured but no
-- booking row is created. The fallback branch (no preferred worker) is
-- already wrapped in EXCEPTION and never triggers this bug — which is
-- why only "Choose Favourite Worker" flow fails.
--
-- FIX
-- ---
-- 1. Ensure the supabase_url / service_role_key GUCs are set (idempotent).
-- 2. Rewrite notify_workers_fcm() so BOTH the preferred FCM call and the
--    booking_requests insert are wrapped in EXCEPTION handlers and the
--    URL is validated to be non-null before calling pg_net. Preferred-
--    worker prioritisation (order_sequence=1, 15s exclusive window) is
--    preserved.
-- =====================================================================

-- 1) Make sure the GUCs exist. Adjust the values to your project if the
--    ALTER DATABASE below is not allowed on your role — you can also set
--    them via `SET LOCAL` in a session or via Supabase project settings.
DO $$
DECLARE
  v_url text := current_setting('app.settings.supabase_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  IF v_url IS NULL OR v_url = '' THEN
    RAISE WARNING
      'app.settings.supabase_url GUC is NOT SET on this database. '
      'notify_workers_fcm cannot dispatch pushes until it is configured. '
      'Set it with: ALTER DATABASE postgres SET app.settings.supabase_url = ''https://<ref>.supabase.co'';';
  END IF;
  IF v_key IS NULL OR v_key = '' THEN
    RAISE WARNING
      'app.settings.service_role_key GUC is NOT SET on this database. '
      'notify_workers_fcm cannot dispatch pushes until it is configured.';
  END IF;
END $$;

-- 2) Hardened trigger function.
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
  v_base_url TEXT := current_setting('app.settings.supabase_url', true);
  v_service_key TEXT := current_setting('app.settings.service_role_key', true);
  v_fcm_url TEXT;
  v_dispatch_url TEXT;
BEGIN
  IF NEW.booking_type <> 'instant' THEN
    RETURN NEW;
  END IF;

  -- GUARDRAIL: if base URL is missing, DO NOT let pg_net raise a
  -- NOT NULL violation on net.http_request_queue. Log and skip the
  -- async push — the booking itself must still succeed.
  IF v_base_url IS NULL OR v_base_url = '' THEN
    RAISE LOG
      'notify_workers_fcm: app.settings.supabase_url GUC is NULL — '
      'skipping worker push for booking %', NEW.id;
    RETURN NEW;
  END IF;

  v_fcm_url      := v_base_url || '/functions/v1/send-worker-fcm';
  v_dispatch_url := v_base_url || '/functions/v1/dispatch-pending-bookings';

  v_body := NEW.service_type || ' • ' || NEW.community || ' • Flat ' || COALESCE(NEW.flat_no, '');
  v_data := jsonb_build_object(
    'type', 'BOOKING_ALERT',
    'booking_id', NEW.id,
    'service_type', NEW.service_type,
    'community', NEW.community,
    'flat_no', COALESCE(NEW.flat_no, ''),
    'customer_name', COALESCE(NEW.cust_name, '')
  );

  ------------------------------------------------------------------
  -- Preferred / Favourite worker branch — FIRST PRIORITY
  ------------------------------------------------------------------
  IF NEW.preferred_worker_id IS NOT NULL THEN
    BEGIN
      SELECT w.id, w.full_name INTO v_worker
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
        -- Reserve the 15-second exclusive window for the favourite worker.
        BEGIN
          INSERT INTO booking_requests
            (booking_id, worker_id, order_sequence, timeout_at, status, notification_status)
          VALUES
            (NEW.id, v_worker.id, 1, now() + interval '15 seconds', 'pending', 'sent')
          ON CONFLICT (booking_id, worker_id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
          RAISE LOG
            'notify_workers_fcm: booking_requests insert failed for booking=% worker=%: %',
            NEW.id, v_worker.id, SQLERRM;
        END;

        -- Push to the favourite worker. Guard EVERY pg_net call so a
        -- misconfigured URL / null token never aborts the booking insert.
        BEGIN
          SELECT token INTO v_token FROM fcm_tokens WHERE user_id = v_worker.id;
          IF v_token IS NOT NULL AND v_fcm_url IS NOT NULL THEN
            PERFORM net.http_post(
              url := v_fcm_url,
              headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
              ),
              body := jsonb_build_object(
                'token', v_token,
                'title', 'New Booking',
                'body', v_body,
                'data', v_data
              )
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE LOG
            'notify_workers_fcm: send-worker-fcm pg_net call failed for booking=% worker=%: %',
            NEW.id, v_worker.id, SQLERRM;
        END;

        v_preferred_eligible := true;
      ELSE
        -- Selected favourite is offline / unavailable — clear the
        -- preferred_worker_id so the dispatcher opens the pool.
        BEGIN
          UPDATE bookings
             SET preferred_worker_id = NULL
           WHERE id = NEW.id;
        EXCEPTION WHEN OTHERS THEN
          RAISE LOG
            'notify_workers_fcm: clearing preferred_worker_id failed for %: %',
            NEW.id, SQLERRM;
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Belt & suspenders: never let the preferred branch abort the
      -- booking insert for ANY reason.
      RAISE LOG
        'notify_workers_fcm: preferred branch failed for booking=% (preferred=%): %',
        NEW.id, NEW.preferred_worker_id, SQLERRM;
    END;
  END IF;

  ------------------------------------------------------------------
  -- Fallback / general dispatch — hand off to modern dispatcher.
  ------------------------------------------------------------------
  IF NOT v_preferred_eligible THEN
    BEGIN
      IF v_dispatch_url IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_dispatch_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
          ),
          body := jsonb_build_object('booking_id', NEW.id)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG
        'notify_workers_fcm: dispatch kick failed for booking=%: %',
        NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_workers_fcm() IS
  'AFTER INSERT trigger on bookings. Sends FCM push to the preferred worker (if any) '
  'and hands off to dispatch-pending-bookings edge function. Every pg_net call and '
  'sub-INSERT is wrapped in EXCEPTION handlers, and pg_net is skipped if the '
  'app.settings.supabase_url GUC is NULL, so a misconfigured URL can never abort '
  'the booking INSERT with a http_request_queue NOT NULL violation.';

-- =====================================================================
-- Verify:
--   SELECT prosrc FROM pg_proc WHERE proname = 'notify_workers_fcm';
--   -- Should include: "IF v_base_url IS NULL OR v_base_url = '' THEN RETURN NEW;"
-- =====================================================================
