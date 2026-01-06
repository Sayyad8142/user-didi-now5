-- Add payment confirmation fields to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_method text NULL,
ADD COLUMN IF NOT EXISTS paid_confirmed_by_user boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS paid_confirmed_at timestamptz NULL;

-- Update RLS policy to allow users to update their own booking payment fields
CREATE POLICY "Users can update their own booking payment fields"
ON public.bookings
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);