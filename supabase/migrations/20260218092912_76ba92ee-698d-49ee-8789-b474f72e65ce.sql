
-- Add discount columns to bookings table
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS discount_inr integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text;

-- Create trigger function to compute off-peak discount server-side
CREATE OR REPLACE FUNCTION public.apply_offpeak_discount()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for scheduled bookings with a scheduled_time
  IF NEW.booking_type = 'scheduled' AND NEW.scheduled_time IS NOT NULL THEN
    -- Check if slot is between 10:00 and 14:00 (inclusive, meaning < 14:15)
    IF NEW.scheduled_time >= '10:00:00'::time AND NEW.scheduled_time <= '14:00:00'::time THEN
      NEW.discount_inr := 10;
      NEW.discount_reason := 'off_peak_10_to_2';
    ELSE
      NEW.discount_inr := 0;
      NEW.discount_reason := NULL;
    END IF;
  ELSE
    NEW.discount_inr := 0;
    NEW.discount_reason := NULL;
  END IF;

  -- Deduct discount from price_inr so final price is always correct
  IF NEW.discount_inr > 0 AND NEW.price_inr IS NOT NULL THEN
    NEW.price_inr := NEW.price_inr - NEW.discount_inr;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger (BEFORE INSERT so it modifies the row before save)
DROP TRIGGER IF EXISTS trg_apply_offpeak_discount ON public.bookings;
CREATE TRIGGER trg_apply_offpeak_discount
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_offpeak_discount();
