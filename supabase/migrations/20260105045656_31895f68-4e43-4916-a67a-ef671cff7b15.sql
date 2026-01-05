-- Add reach confirmation columns to bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS reach_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS reach_confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reach_confirmed_by TEXT;

-- Add constraint for valid reach_status values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_reach_status_check'
  ) THEN
    ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_reach_status_check 
    CHECK (reach_status IN ('pending', 'reached', 'not_reached'));
  END IF;
END $$;