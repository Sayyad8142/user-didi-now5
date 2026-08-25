-- ============================================================================
-- READ-ONLY AUDIT — remaining AUTOMATIC booking-cancellation paths.
-- Run on the EXTERNAL DB (api.didisnow.com). Paste the output back.
-- Nothing here writes data.
-- ============================================================================

-- A1. Every function whose body writes a cancelled status.
--     Expected legitimate: user_cancel_booking, admin cancel RPC.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND pg_get_functiondef(p.oid) ~* 'cancelled'
ORDER BY p.proname;

-- A2. Full body of the overdue/SLA routine (probe shows it still exists).
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'auto_handle_overdue_bookings';

-- A3. Triggers on bookings.
SELECT t.tgname, p.proname
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.bookings'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;

-- A4. Scheduled jobs.
SELECT jobid, schedule, jobname, command FROM cron.job ORDER BY jobid;

-- A5. Evidence: how recent cancellations happened.
SELECT id, booking_type, service_type, status, created_at, cancelled_at,
       cancellation_reason
FROM bookings
WHERE status = 'cancelled' AND cancelled_at > now() - interval '7 days'
ORDER BY cancelled_at DESC
LIMIT 50;

-- ============================================================================
-- NEUTRALISER — apply ONLY IF A2 shows auto_handle_overdue_bookings writes
-- status='cancelled'. Keep the rest of its logic; replace the cancelling
-- UPDATE with a log line. Template:
-- ============================================================================
-- CREATE OR REPLACE FUNCTION public.auto_handle_overdue_bookings()
-- RETURNS integer
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE v_overdue integer;
-- BEGIN
--   SELECT count(*) INTO v_overdue
--   FROM bookings
--   WHERE status IN ('pending','dispatched','waiting_for_worker')
--     AND cancelled_at IS NULL
--     AND created_at < now() - interval '20 minutes';
--   RAISE LOG 'auto_cancel_blocked: % overdue booking(s) kept waiting for redispatch', v_overdue;
--   RETURN 0;   -- never cancels
-- END $$;
-- COMMENT ON FUNCTION public.auto_handle_overdue_bookings() IS
--   'DISABLED BY POLICY 2026-08-25: no-op. Bookings are never auto-cancelled for SLA/dispatch timeout.';
