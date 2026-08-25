-- ============================================================================
-- DISABLE ALL AUTOMATIC BOOKING CANCELLATION
-- Run on the EXTERNAL Supabase project (api.didisnow.com) SQL editor.
-- Independent of docs/fix-old-app-availability-compat.sql — apply either order.
--
-- POLICY: a booking is NEVER cancelled because no worker accepted, it went
-- stale, the dispatch window expired, or an SLA expired. Only USER, ADMIN, or
-- an explicit authorized manual flow may cancel.
--
-- This script does NOT touch:
--   * user_cancel_booking / the cancel-booking edge function  (USER)
--   * any admin cancellation RPC or admin panel update        (ADMIN)
--   * refund RPCs / triggers (refund_booking_actual_paid,
--     trg_auto_wallet_refund_on_cancel) — they still fire for legitimate
--     user/admin cancellations.
--   * dispatch, offer dedup, eligibility, priority or capacity logic.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Neutralise the stale-booking auto-cancel. Kept as a callable no-op so
--    any pg_cron job, trigger, or old caller still succeeds — it simply
--    cancels nothing and records the blocked attempt in the Postgres log.
--    (Was: UPDATE bookings SET status='cancelled' ... created_at < now()-90min)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_cancel_stale_instant_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_waiting integer;
BEGIN
  SELECT count(*) INTO v_waiting
  FROM bookings
  WHERE status IN ('pending', 'dispatched', 'waiting_for_worker')
    AND booking_type = 'instant'
    AND cancelled_at IS NULL
    AND created_at < (now() - interval '90 minutes');

  RAISE LOG 'auto_cancel_blocked: policy forbids automatic cancellation; % stale instant booking(s) kept waiting for redispatch', v_waiting;

  RETURN 0;   -- nothing cancelled, ever
END;
$$;

COMMENT ON FUNCTION public.auto_cancel_stale_instant_bookings() IS
  'DISABLED BY POLICY 2026-08-25: no-op that always returns 0. Bookings must never be auto-cancelled for worker non-acceptance or dispatch timeout. Only USER/ADMIN/explicit manual flows may cancel.';

COMMIT;

-- ============================================================================
-- 2. AUDIT — run these SELECTs and review the output. They are read-only.
--    Anything they return is a REMAINING automatic-cancellation candidate.
-- ============================================================================

-- 2a. Every function whose body writes status='cancelled'.
--     Expected legitimate results: user cancel RPC, admin cancel RPC.
--     Anything mentioning stale / overdue / sla / timeout / no_worker must be
--     neutralised the same way as section 1.
-- SELECT n.nspname, p.proname,
--        pg_get_function_identity_arguments(p.oid) AS args
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND pg_get_functiondef(p.oid) ~* 'cancelled'
-- ORDER BY p.proname;

-- 2b. Inspect a specific suspect body (e.g. the other SLA routine):
-- SELECT pg_get_functiondef(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'auto_handle_overdue_bookings';
--   -> If it sets bookings.status='cancelled', replace that UPDATE with a
--      RAISE LOG 'auto_cancel_blocked ...' and keep the rest of its logic.

-- 2c. Triggers on bookings that could cancel:
-- SELECT t.tgname, p.proname
-- FROM pg_trigger t
-- JOIN pg_proc p ON p.oid = t.tgfoid
-- WHERE t.tgrelid = 'public.bookings'::regclass AND NOT t.tgisinternal
-- ORDER BY t.tgname;

-- 2d. Scheduled jobs that could cancel (pg_cron):
-- SELECT jobid, schedule, jobname, command FROM cron.job ORDER BY jobid;
--   -> Any job invoking auto_cancel_stale_instant_bookings is now harmless
--      (section 1 made it a no-op). You may also unschedule it:
--      SELECT cron.unschedule(<jobid>);
