-- Add columns with constrained values and sensible defaults
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cook_cuisine_pref TEXT
    CHECK (cook_cuisine_pref IN ('north','south','any')) DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS cook_gender_pref TEXT
    CHECK (cook_gender_pref IN ('male','female','any')) DEFAULT 'any';

-- Backfill existing cook bookings to 'any'
UPDATE public.bookings
SET cook_cuisine_pref = COALESCE(cook_cuisine_pref,'any'),
    cook_gender_pref  = COALESCE(cook_gender_pref,'any')
WHERE service_type = 'cook';