-- =====================================================================
-- FIX: notify_workers_fcm() must not depend on Postgres GUCs
--      (app.settings.supabase_url / app.settings.service_role_key).
-- =====================================================================
-- Run this on the EXTERNAL DB (paywwbuqycovjopryele / api.didisnow.com)
-- in the Supabase SQL Editor. Idempotent, safe to re-run.
--
-- BACKGROUND
-- ----------
-- Supabase-managed Postgres does NOT allow project owners to run
--   ALTER DATABASE postgres SET app.settings.supabase_url = '...';
-- The role lacks the privilege to set custom GUCs. Any trigger that
-- relies on current_setting('app.settings.*') for a URL or a key is
-- therefore broken by design on Supabase.
--
-- The previous version of notify_workers_fcm() read both a base URL
-- and a service-role key from GUCs, built the send-worker-fcm and
-- dispatch-pending-bookings URLs from them, and called pg_net inline.
-- With GUCs unset, either (a) pg_net wrote a NULL url row and the
-- booking INSERT was aborted, or (b) the guarded version silently
-- skipped both the preferred-worker push and the dispatch kick — the
-- favourite-worker priority window was never reserved either, because
-- that INSERT lived under the same URL-check branch.
--
-- NEW DESIGN
-- ----------
-- The trigger becomes a pure DB function:
--   * On instant booking INSERT with preferred_worker_id set and the
--     worker eligible (active, available, not busy, service+community
--     match), reserve the 15-second exclusive window by inserting a
--     row into booking_requests with order_sequence=1 and
--     timeout_at = now()+15s.
--   * If the chosen favourite is not eligible, clear
--     bookings.preferred_worker_id so downstream dispatch treats it
--     as a general booking.
--   * No pg_net calls. No URLs. No keys. No GUC reads.
--
-- Notifications and dispatch are handled by the Edge Function layer,
-- which already has EXTERNAL_SUPABASE_SERVICE_ROLE_KEY in Deno env:
--   * create-paid-booking and razorpay-webhook already POST to
--     dispatch-pending-bookings after every successful booking INSERT
--     (verified in supabase/functions/create-paid-booking/index.ts
--     line ~960 and supabase/functions/razorpay-webhook/index.ts
--     line ~228).
--   * dispatch-pending-bookings is responsible for reading the
--     pre-existing preferred_worker_id + booking_requests row, sending
--     the FCM push to the favourite worker, honouring the 15-second
--     window, and then falling back to the general pool.
--
-- This eliminates every runtime dependency on DB-level secrets.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_workers_fcm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker RECORD;
BEGIN
  -- Only instant bookings participate in the favourite-worker window.
  -- Scheduled bookings are handled by run_scheduled_prealerts /
  -- scheduled-dispatch edge function.
  IF NEW.booking_type <> 'instant' THEN
    RETURN NEW;
  END IF;

  -- No preferred worker: nothing for the trigger to do. The edge
  -- function will call dispatch-pending-bookings after INSERT and the
  -- dispatcher will assign from the general pool.
  IF NEW.preferred_worker_id IS NULL THEN
    RETURN NEW;
  END IF;

  ------------------------------------------------------------------
  -- Preferred / Favourite worker branch — reserve the 15-second
  -- exclusive window if the worker is currently eligible.
  ------------------------------------------------------------------
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
      -- Reserve the 15-second exclusive window for the favourite
      -- worker. notification_status is left as 'pending' — the edge
      -- function (dispatch-pending-bookings / send-worker-fcm) is the
      -- authority for actually sending the push and flipping the
      -- status to 'sent'.
      BEGIN
        INSERT INTO booking_requests
          (booking_id, worker_id, order_sequence, timeout_at, status, notification_status)
        VALUES
          (NEW.id, v_worker.id, 1, now() + interval '15 seconds', 'pending', 'pending')
        ON CONFLICT (booking_id, worker_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        -- Never let a booking_requests failure abort the booking
        -- INSERT — the dispatcher will still pick this booking up.
        RAISE LOG
          'notify_workers_fcm: booking_requests insert failed for booking=% worker=%: %',
          NEW.id, v_worker.id, SQLERRM;
      END;
    ELSE
      -- Favourite worker is offline / unavailable at booking time.
      -- Clear preferred_worker_id so the dispatcher immediately opens
      -- the general pool.
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
    -- Belt & suspenders: the trigger must NEVER abort the booking
    -- INSERT, regardless of what fails inside the preferred branch.
    RAISE LOG
      'notify_workers_fcm: preferred branch failed for booking=% (preferred=%): %',
      NEW.id, NEW.preferred_worker_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_workers_fcm() IS
  'AFTER INSERT trigger on bookings. Pure-DB function: reserves the '
  '15-second exclusive favourite-worker window in booking_requests, or '
  'clears preferred_worker_id if the chosen worker is not currently '
  'eligible. All FCM push and dispatch HTTP work is delegated to the '
  'Edge Function layer (create-paid-booking / razorpay-webhook → '
  'dispatch-pending-bookings), which has service-role credentials in '
  'Deno env. No pg_net, no URLs, no GUCs, no keys required in the DB.';

-- =====================================================================
-- Verify:
--   SELECT prosrc FROM pg_proc WHERE proname = 'notify_workers_fcm';
--   -- Must NOT contain 'net.http_post', 'app.settings.supabase_url',
--   -- or 'app.settings.service_role_key'.
-- =====================================================================
