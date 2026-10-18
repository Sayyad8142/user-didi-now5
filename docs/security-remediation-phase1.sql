-- =====================================================================
-- DIDI NOW — CUSTOMER BOOKING SECURITY (run by the owner on the EXTERNAL
-- production database; NOT executed by Lovable). Run section 1 first and
-- review its output before running section 2.
-- Deploy the updated User App build BEFORE section 2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SECTION 1 — READ-ONLY CHECK of live rules on public.bookings
-- ---------------------------------------------------------------------
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bookings';

SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t WHERE tgrelid = 'public.bookings'::regclass AND NOT tgisinternal;

SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'bookings' AND grantee IN ('anon','authenticated');

SELECT pg_get_functiondef('public.notify_user_booking_push()'::regprocedure); -- errors if absent (fine)

-- ---------------------------------------------------------------------
-- SECTION 2 — COLUMN GUARD: only service-role may change server-managed
-- booking columns. Customers may still change reach_* via policy.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_bookings_server_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.status                IS DISTINCT FROM OLD.status
  OR NEW.payment_status        IS DISTINCT FROM OLD.payment_status
  OR NEW.payment_method        IS DISTINCT FROM OLD.payment_method
  OR NEW.price_inr             IS DISTINCT FROM OLD.price_inr
  OR NEW.worker_id             IS DISTINCT FROM OLD.worker_id
  OR NEW.completion_otp        IS DISTINCT FROM OLD.completion_otp
  OR NEW.otp_verified_at       IS DISTINCT FROM OLD.otp_verified_at
  OR NEW.otp_verified_by_worker_id IS DISTINCT FROM OLD.otp_verified_by_worker_id
  OR NEW.paid_confirmed_by_user IS DISTINCT FROM OLD.paid_confirmed_by_user
  OR NEW.paid_confirmed_at     IS DISTINCT FROM OLD.paid_confirmed_at
  OR NEW.user_id               IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'forbidden: server-managed booking column' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_bookings_server_columns ON public.bookings;
CREATE TRIGGER trg_guard_bookings_server_columns
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_bookings_server_columns();

-- NOTE: if the Worker App updates bookings with its own (non-service-role)
-- session for status changes (accepted/on_the_way/started), this trigger
-- WILL block it. Confirm with Section 1 + Worker App source before running.

-- ---------------------------------------------------------------------
-- SECTION 3 — Stop sending the OTP inside push notifications.
-- Only if Section 1 showed notify_user_booking_push exists and is attached.
-- Edit the existing function: replace the "Worker Assigned" body with
--   COALESCE(NEW.worker_name,'A worker') || ' has been assigned to your ' || NEW.service_type || ' booking. Open the app to view your OTP.'
-- and remove the 'completion_otp' key from the data object.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS trg_guard_bookings_server_columns ON public.bookings;
-- DROP FUNCTION IF EXISTS public.guard_bookings_server_columns();
