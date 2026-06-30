-- Optional: store the server-validated loyalty surge separately for admin visibility.
-- Run on the EXTERNAL DB (api.didisnow.com).
--
-- If you skip this, the edge functions will transparently strip the columns
-- via OPTIONAL_BOOKING_INSERT_COLUMNS — no failures, but you lose audit visibility.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS loyalty_surge_amount integer NOT NULL DEFAULT 0;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS base_price_inr numeric;

COMMENT ON COLUMN public.bookings.loyalty_surge_amount
  IS 'Per-user dynamic pricing surge added on top of base_price_inr. Validated server-side.';

COMMENT ON COLUMN public.bookings.base_price_inr
  IS 'Server-validated base price BEFORE loyalty_surge_amount. price_inr = base_price_inr + loyalty_surge_amount.';
