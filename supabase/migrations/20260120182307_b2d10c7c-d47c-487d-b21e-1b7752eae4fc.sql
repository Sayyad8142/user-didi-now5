-- Add surcharge tracking fields to bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS surcharge_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS surcharge_reason text;