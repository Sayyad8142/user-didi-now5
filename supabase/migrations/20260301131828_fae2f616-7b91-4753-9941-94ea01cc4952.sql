-- RPC: check_instant_supply
-- Returns pending instant booking count for a community
-- Used for supply protection: max 3 pending instant bookings per community
CREATE OR REPLACE FUNCTION public.check_instant_supply(p_community text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM bookings
  WHERE community = p_community
    AND booking_type = 'instant'
    AND status IN ('pending', 'dispatched', 'accepted', 'assigned')
$$;
