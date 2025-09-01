-- Add is_demo column to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;