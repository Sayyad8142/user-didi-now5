-- =====================================================================
-- Bookings table — loyalty surge audit columns
-- =====================================================================
-- Run this on the EXTERNAL DB (api.didisnow.com) via Supabase SQL Editor.
--
-- Adds two columns so the server-validated loyalty surge is stored
-- separately from the final price. Safe to run multiple times.
-- Does NOT touch any existing rows or data.
--
-- If you skip this migration, the edge functions transparently strip
-- the columns via OPTIONAL_BOOKING_INSERT_COLUMNS — bookings keep
-- working, but you lose the per-row audit trail.
-- =====================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS base_price_inr numeric;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS loyalty_surge_amount integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bookings.base_price_inr IS
  'Server-validated base price BEFORE loyalty_surge_amount is added. '
  'Invariant: price_inr = base_price_inr + loyalty_surge_amount '
  '(+ any slot_surge / dish_intensity already folded into base).';

COMMENT ON COLUMN public.bookings.loyalty_surge_amount IS
  'Per-user dynamic pricing surge (₹) added on top of base_price_inr. '
  'Computed server-side from get_user_surge_amount() at booking time. '
  'Tiers: #1–3=0, #4–6=10, #7–10=30, #11–14=60, +30 every next 4.';

-- =====================================================================
-- Verify:
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'bookings'
--     AND column_name IN ('base_price_inr', 'loyalty_surge_amount');
-- =====================================================================
