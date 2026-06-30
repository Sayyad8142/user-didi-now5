-- Per-user loyalty surge pricing — OPTIONAL server-side helper.
--
-- The client computes the surge in src/lib/userSurge.ts. This RPC mirrors
-- the same logic on the database side so edge functions
-- (create-paid-booking, create-pending-booking, create-razorpay-order)
-- can VALIDATE the client-submitted price against the user's true tier
-- and reject tampered/discounted requests.
--
-- Tiers (must match src/lib/userSurge.ts):
--   Bookings #1–3   → +₹0
--   Bookings #4–6   → +₹10
--   Bookings #7–10  → +₹30
--   Bookings #11–14 → +₹60
--   Each next tier of 4 → +₹30 more
--
-- Run this in the EXTERNAL DB (api.didisnow.com).

CREATE OR REPLACE FUNCTION public.get_user_surge_amount(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_booking_number integer;
  v_tiers_above_10 integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.bookings
  WHERE user_id = p_user_id
    AND status NOT IN ('cancelled', 'failed', 'rejected');

  v_booking_number := COALESCE(v_count, 0) + 1;

  IF v_booking_number <= 3 THEN RETURN 0;
  ELSIF v_booking_number <= 6 THEN RETURN 10;
  ELSIF v_booking_number <= 10 THEN RETURN 30;
  ELSE
    v_tiers_above_10 := FLOOR((v_booking_number - 11) / 4.0)::int + 1;
    RETURN 30 + v_tiers_above_10 * 30;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_surge_amount(uuid) TO authenticated, service_role;

-- USAGE in edge functions (pseudocode):
--   const { data: expectedSurge } = await externalSupabase.rpc('get_user_surge_amount', { p_user_id: userId });
--   const expectedTotal = basePrice + expectedSurge;
--   if (Math.abs(clientPrice - expectedTotal) > 1) {
--     return new Response('Price mismatch', { status: 400 });
--   }
