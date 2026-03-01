-- Hard server-side protection: DB trigger to block instant booking inserts when supply is full
CREATE OR REPLACE FUNCTION public.enforce_instant_supply_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pending_count integer;
  max_allowed integer := 3;
BEGIN
  -- Only enforce on instant bookings with active statuses
  IF NEW.booking_type = 'instant' AND NEW.status IN ('pending','dispatched','accepted','assigned') THEN
    SELECT count(*)
    INTO pending_count
    FROM bookings
    WHERE community = NEW.community
      AND booking_type = 'instant'
      AND status IN ('pending','dispatched','accepted','assigned');

    IF pending_count >= max_allowed THEN
      RAISE EXCEPTION 'SUPPLY_FULL: All experts are currently busy. Please try again later or schedule instead.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER check_supply_before_insert
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_instant_supply_limit();
