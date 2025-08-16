-- Add confirmed_at timestamp for audit trail
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Allow admins to update bookings (change status, etc.)
DROP POLICY IF EXISTS bookings_update_admin ON public.bookings;
CREATE POLICY bookings_update_admin ON public.bookings
FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());