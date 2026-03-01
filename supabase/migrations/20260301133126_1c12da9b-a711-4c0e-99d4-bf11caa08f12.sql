-- Update RPC to only count 'pending' status
CREATE OR REPLACE FUNCTION public.check_instant_supply(p_community text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM bookings
  WHERE community = p_community
    AND booking_type = 'instant'
    AND status = 'pending';
$$;

-- Update trigger to only count 'pending' status
CREATE OR REPLACE FUNCTION public.enforce_instant_supply_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pending_count integer;
  max_allowed integer := 3;
BEGIN
  IF NEW.booking_type = 'instant' AND NEW.status = 'pending' THEN
    SELECT count(*)
    INTO pending_count
    FROM bookings
    WHERE community = NEW.community
      AND booking_type = 'instant'
      AND status = 'pending';

    IF pending_count >= max_allowed THEN
      RAISE EXCEPTION 'SUPPLY_FULL: All experts are currently busy. Please try again later or schedule instead.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
