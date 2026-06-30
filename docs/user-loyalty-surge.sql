-- =====================================================================
-- Per-user loyalty surge pricing — server-side source of truth
-- =====================================================================
-- Run this on the EXTERNAL DB (api.didisnow.com) via Supabase SQL Editor.
--
-- This RPC is called by edge functions
-- (create-paid-booking, create-pending-booking, create-razorpay-order)
-- to VALIDATE client-submitted prices and reject tampered requests.
--
-- Tier table (must match src/lib/userSurge.ts):
--   Bookings #1–3    → +₹0   (base)
--   Bookings #4–6    → +₹10
--   Bookings #7–10   → +₹30
--   Bookings #11–14  → +₹60
--   Each next tier of 4 → +₹30 more (15–18 = +90, 19–22 = +120, …)
--
-- Counts only NON-cancelled bookings (status NOT IN cancelled/failed/rejected).
-- The booking currently being placed is the (count + 1)th.
-- =====================================================================

-- Drop old signature if it exists (we used to return integer)
DROP FUNCTION IF EXISTS public.get_user_surge_amount(uuid);

CREATE OR REPLACE FUNCTION public.get_user_surge_amount(p_user_id uuid)
RETURNS TABLE (
  booking_count        integer,
  surge_amount         integer,
  tier_number          integer,
  next_tier_booking    integer,
  next_surge_amount    integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count           integer := 0;
  v_booking_number  integer;   -- the (count + 1)th booking being placed
  v_surge           integer;
  v_tier            integer;
  v_next_threshold  integer;
  v_next_surge      integer;
  v_tiers_above_10  integer;
BEGIN
  -- Guest / missing user → base price, tier 1
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT 0, 0, 1, 4, 10;
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_count
  FROM public.bookings
  WHERE user_id = p_user_id
    AND status NOT IN ('cancelled', 'failed', 'rejected');

  v_booking_number := COALESCE(v_count, 0) + 1;

  IF v_booking_number <= 3 THEN
    v_surge          := 0;
    v_tier           := 1;
    v_next_threshold := 4;
    v_next_surge     := 10;
  ELSIF v_booking_number <= 6 THEN
    v_surge          := 10;
    v_tier           := 2;
    v_next_threshold := 7;
    v_next_surge     := 30;
  ELSIF v_booking_number <= 10 THEN
    v_surge          := 30;
    v_tier           := 3;
    v_next_threshold := 11;
    v_next_surge     := 60;
  ELSE
    -- 11+: +₹30 per group of 4 above 10
    v_tiers_above_10 := FLOOR((v_booking_number - 11) / 4.0)::int + 1;  -- 1, 2, 3...
    v_surge          := 30 + v_tiers_above_10 * 30;                     -- 60, 90, 120...
    v_tier           := 3 + v_tiers_above_10;                           -- 4, 5, 6...
    v_next_threshold := 11 + v_tiers_above_10 * 4;                      -- 15, 19, 23...
    v_next_surge     := v_surge + 30;
  END IF;

  RETURN QUERY SELECT
    v_count,
    v_surge,
    v_tier,
    v_next_threshold,
    v_next_surge;
END;
$$;

COMMENT ON FUNCTION public.get_user_surge_amount(uuid) IS
  'Returns loyalty surge tier info for a user''s NEXT booking. '
  'Counts only non-cancelled bookings. Used by edge functions to validate '
  'client-submitted prices against the authoritative server tier.';

-- Index to keep the COUNT(*) cheap as bookings grow
CREATE INDEX IF NOT EXISTS idx_bookings_user_status_surge
  ON public.bookings (user_id, status)
  WHERE status NOT IN ('cancelled', 'failed', 'rejected');

GRANT EXECUTE ON FUNCTION public.get_user_surge_amount(uuid)
  TO authenticated, service_role;

-- =====================================================================
-- Quick test (replace UUID with a real user_id):
--   SELECT * FROM public.get_user_surge_amount('00000000-0000-0000-0000-000000000000');
-- =====================================================================
