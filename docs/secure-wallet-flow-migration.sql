-- =============================================================
-- SECURE WALLET PAYMENT FLOW — DEFENSE IN DEPTH
-- Run this on the EXTERNAL Supabase project (paywwbuqycovjopryele)
-- =============================================================
--
-- PROBLEM (BEFORE):
--   Frontend was inserting bookings with payment_status='paid' and
--   then calling wallet-pay AFTER. A malicious client could create
--   "free" paid bookings by skipping the wallet-pay call.
--
-- FIX (AFTER):
--   1. All wallet payments now route through create-paid-booking edge fn
--      which atomically debits wallet → inserts booking → refunds on failure.
--   2. RLS blocks authenticated users from setting payment_status='paid'.
--      Only service_role (used by edge functions) can mark a booking paid.
--   3. completion_otp is generated server-side (in edge fn + DB trigger guard).
-- =============================================================

-- ── 1. RLS guard: block authenticated users from inserting "paid" bookings ──
-- This prevents the wallet-bypass exploit even if someone replays old client code.
CREATE OR REPLACE FUNCTION public.guard_booking_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role bypasses this (edge functions run as service_role)
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For everyone else: payment_status MUST be 'unpaid' or 'pending' on insert
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status IN ('paid', 'moved_to_wallet') THEN
      RAISE EXCEPTION 'forbidden: payment_status=% can only be set by backend', NEW.payment_status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- On update: prevent escalating to paid/moved_to_wallet from client
  IF TG_OP = 'UPDATE' THEN
    IF NEW.payment_status IN ('paid', 'moved_to_wallet')
       AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
      RAISE EXCEPTION 'forbidden: only backend may mark a booking paid'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_payment_status ON public.bookings;
CREATE TRIGGER trg_guard_booking_payment_status
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_booking_payment_status();

-- ── 2. Re-affirm OTP generation trigger (already exists, but ensure it overrides client) ──
-- The trigger from phase1-payment-migration.sql only sets OTP if NULL.
-- We harden it: ALWAYS regenerate OTP on insert (client-supplied OTP is ignored).
CREATE OR REPLACE FUNCTION public.auto_generate_booking_otp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Always overwrite client-supplied OTP for security
  NEW.completion_otp := public.generate_completion_otp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_generate_booking_otp ON public.bookings;
CREATE TRIGGER trg_auto_generate_booking_otp
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_booking_otp();

-- =============================================================
-- VERIFICATION QUERIES (run after migration)
-- =============================================================
-- 1. Try inserting a "paid" booking as anon — should fail:
--    SET ROLE anon;
--    INSERT INTO bookings (user_id, service_type, payment_status) VALUES (..., ..., 'paid');
--    -- Expected: ERROR forbidden: payment_status=paid can only be set by backend
--
-- 2. Service role insert should succeed:
--    SET ROLE service_role;
--    INSERT INTO bookings (user_id, service_type, payment_status) VALUES (..., ..., 'paid');
--    -- Expected: success, completion_otp auto-generated
-- =============================================================
