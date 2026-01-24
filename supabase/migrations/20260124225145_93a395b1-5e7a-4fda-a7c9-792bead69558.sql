-- Add glass partition fields to bookings table for bathroom cleaning service
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS has_glass_partition boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS glass_partition_fee integer DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.bookings.has_glass_partition IS 'Whether glass partition cleaning was selected for bathroom cleaning service';
COMMENT ON COLUMN public.bookings.glass_partition_fee IS 'Additional fee charged for glass partition cleaning (₹30 per bathroom)';