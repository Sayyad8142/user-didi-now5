-- Fix infinite recursion in RLS policies by creating security definer functions

-- Create a security definer function to check if user can see a booking
CREATE OR REPLACE FUNCTION public.user_can_see_booking(booking_row bookings)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- User can see their own bookings
  IF booking_row.user_id = auth.uid() THEN
    RETURN true;
  END IF;
  
  -- Worker can see assigned bookings
  IF booking_row.worker_id = auth.uid() THEN
    RETURN true;
  END IF;
  
  -- Worker can see matching pending bookings
  IF booking_row.status = 'pending' THEN
    IF EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = auth.uid()
        AND booking_row.service_type = ANY(w.service_types)
        AND (booking_row.community = ANY(w.communities) OR booking_row.community = w.community)
    ) THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;

-- Drop problematic policies that cause recursion
DROP POLICY IF EXISTS "workers_see_assigned" ON bookings;
DROP POLICY IF EXISTS "workers_see_matching_pending" ON bookings;
DROP POLICY IF EXISTS "bookings assigned read" ON bookings;

-- Create new consolidated worker policy using the security definer function
CREATE POLICY "workers_can_see_relevant_bookings"
ON bookings
FOR SELECT
TO authenticated
USING (
  user_can_see_booking(bookings.*)
);