-- =============================================================
-- REACH STATUS RLS — allow user to mark "Reached / Not Reached"
-- Run on EXTERNAL Supabase project (paywwbuqycovjopryele)
-- =============================================================
--
-- WHY:
-- The frontend now has a fallback path that does a direct
-- supabase.from('bookings').update({ reach_status, reach_confirmed_at,
-- reach_confirmed_by }) when the confirm-worker-reach edge function
-- is not deployed / 404s. RLS must allow this update for the booking
-- owner only and ONLY for these three columns.
-- =============================================================

-- Drop existing if present
DROP POLICY IF EXISTS "users_update_reach_status_on_own_booking" ON public.bookings;

-- Allow the booking owner to set reach_status/reach_confirmed_at/reach_confirmed_by
CREATE POLICY "users_update_reach_status_on_own_booking"
  ON public.bookings
  FOR UPDATE
  TO authenticated, anon
  USING (
    user_id = public.get_profile_id()
  )
  WITH CHECK (
    user_id = public.get_profile_id()
  );

-- Optional hardening: column-level guard via trigger so users cannot
-- piggy-back this policy to mutate other columns.
CREATE OR REPLACE FUNCTION public.guard_user_reach_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Service role bypasses
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block changes to anything except reach_* columns when called from a user session
  IF (NEW.status IS DISTINCT FROM OLD.status)
     OR (NEW.payment_status IS DISTINCT FROM OLD.payment_status)
     OR (NEW.price_inr IS DISTINCT FROM OLD.price_inr)
     OR (NEW.completion_otp IS DISTINCT FROM OLD.completion_otp)
     OR (NEW.worker_id IS DISTINCT FROM OLD.worker_id)
  THEN
    -- Only allow if a service role / definer function is invoking
    -- (these fields are server-managed)
    RAISE EXCEPTION 'forbidden: this column is server-managed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Note: This trigger is OPTIONAL — only enable if you do not already
-- restrict updates via RLS column lists. If your project uses
-- column-level RLS, leave this commented out.
-- DROP TRIGGER IF EXISTS trg_guard_user_reach_update ON public.bookings;
-- CREATE TRIGGER trg_guard_user_reach_update
--   BEFORE UPDATE ON public.bookings
--   FOR EACH ROW
--   EXECUTE FUNCTION public.guard_user_reach_update();
