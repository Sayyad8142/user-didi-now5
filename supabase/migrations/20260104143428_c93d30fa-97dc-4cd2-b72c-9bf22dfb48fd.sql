-- Add user_payment_utr column to store UPI Transaction Reference
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS user_payment_utr TEXT;