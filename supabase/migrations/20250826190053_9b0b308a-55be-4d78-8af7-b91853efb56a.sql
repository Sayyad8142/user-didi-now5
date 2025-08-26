-- Enhanced security for bookings table to prevent any potential data leakage
-- Drop existing policies to recreate them with stronger security
DROP POLICY IF EXISTS "secure_bookings_insert_own" ON public.bookings;
DROP POLICY IF EXISTS "secure_bookings_select_admin" ON public.bookings;
DROP POLICY IF EXISTS "secure_bookings_select_own" ON public.bookings;
DROP POLICY IF EXISTS "secure_bookings_update_admin" ON public.bookings;
DROP POLICY IF EXISTS "secure_bookings_update_own" ON public.bookings;

-- Create enhanced policies with explicit authentication checks
CREATE POLICY "bookings_insert_authenticated_user_only" 
  ON public.bookings 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  );

CREATE POLICY "bookings_select_own_authenticated_only" 
  ON public.bookings 
  FOR SELECT 
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  );

CREATE POLICY "bookings_select_admin_authenticated_only" 
  ON public.bookings 
  FOR SELECT 
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND public.is_admin()
  );

CREATE POLICY "bookings_update_own_authenticated_only" 
  ON public.bookings 
  FOR UPDATE 
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() = user_id
  );

CREATE POLICY "bookings_update_admin_authenticated_only" 
  ON public.bookings 
  FOR UPDATE 
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND public.is_admin()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND public.is_admin()
  );

-- Explicitly deny all access to anonymous users
CREATE POLICY "bookings_deny_anonymous_all" 
  ON public.bookings 
  FOR ALL 
  TO anon
  USING (false);

-- Add comment explaining the security measures
COMMENT ON TABLE public.bookings IS 'Contains sensitive customer data including names, phone numbers, and addresses. Access is strictly controlled through RLS policies that require authentication and limit access to booking owners or admins only.';

-- Ensure RLS is enabled
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners (additional security layer)
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;