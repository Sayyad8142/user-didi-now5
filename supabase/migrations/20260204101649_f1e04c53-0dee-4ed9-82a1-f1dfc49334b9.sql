-- Add dish intensity columns to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS dish_intensity text CHECK (dish_intensity IN ('light', 'medium', 'heavy')),
ADD COLUMN IF NOT EXISTS dish_intensity_extra_inr integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.bookings.dish_intensity IS 'Dish washing workload intensity: light, medium, or heavy';
COMMENT ON COLUMN public.bookings.dish_intensity_extra_inr IS 'Extra charge based on dish intensity: 0 for light, 30 for medium, 50 for heavy';