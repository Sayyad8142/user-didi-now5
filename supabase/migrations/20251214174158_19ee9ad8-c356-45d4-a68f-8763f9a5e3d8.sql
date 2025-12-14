-- Fix is_admin() function to use firebase_uid instead of id
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE firebase_uid = auth.uid()::text), 
    false
  )
$$;

-- Create helper function to get profile UUID from Firebase UID
CREATE OR REPLACE FUNCTION public.get_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE firebase_uid = auth.uid()::text LIMIT 1
$$;

-- Fix bookings RLS policies to use the profile UUID lookup
DROP POLICY IF EXISTS "secure_bookings_select_own" ON public.bookings;
DROP POLICY IF EXISTS "secure_bookings_insert_own" ON public.bookings;
DROP POLICY IF EXISTS "secure_bookings_update_own" ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_own_authenticated_only" ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_own_authenticated_only" ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_authenticated_user_only" ON public.bookings;

CREATE POLICY "bookings_select_own_firebase" 
ON public.bookings 
FOR SELECT 
USING (user_id = public.get_profile_id());

CREATE POLICY "bookings_insert_own_firebase" 
ON public.bookings 
FOR INSERT 
WITH CHECK (user_id = public.get_profile_id());

CREATE POLICY "bookings_update_own_firebase" 
ON public.bookings 
FOR UPDATE 
USING (user_id = public.get_profile_id())
WITH CHECK (user_id = public.get_profile_id());

-- Fix support_threads RLS policies
DROP POLICY IF EXISTS "st_user_own" ON public.support_threads;

CREATE POLICY "support_threads_user_own_firebase" 
ON public.support_threads 
FOR ALL 
USING (user_id = public.get_profile_id())
WITH CHECK (user_id = public.get_profile_id());

-- Fix feedback RLS policies
DROP POLICY IF EXISTS "feedback_insert_self" ON public.feedback;
DROP POLICY IF EXISTS "feedback_select_self" ON public.feedback;

CREATE POLICY "feedback_insert_firebase" 
ON public.feedback 
FOR INSERT 
WITH CHECK (user_id = public.get_profile_id());

CREATE POLICY "feedback_select_firebase" 
ON public.feedback 
FOR SELECT 
USING (user_id = public.get_profile_id());