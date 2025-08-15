-- Add family_count and food_pref columns to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS family_count integer,
ADD COLUMN IF NOT EXISTS food_pref text;

-- Add constraints for family_count and food_pref
ALTER TABLE public.bookings 
ADD CONSTRAINT check_family_count CHECK (family_count >= 1 OR family_count IS NULL),
ADD CONSTRAINT check_food_pref CHECK (food_pref IN ('veg', 'non_veg') OR food_pref IS NULL);