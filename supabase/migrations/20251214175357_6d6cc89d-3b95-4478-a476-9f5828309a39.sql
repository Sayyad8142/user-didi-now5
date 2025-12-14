-- The issue is that auth.uid() returns the Firebase UID (text), not a UUID
-- We need to fix all RLS policies that compare auth.uid() to UUID columns

-- First, let's fix the ops_settings table to allow public read for legal version
DROP POLICY IF EXISTS "ops_settings_public_read_legal" ON public.ops_settings;
CREATE POLICY "ops_settings_public_read_legal" 
ON public.ops_settings 
FOR SELECT 
USING (key IN ('current_legal_version', 'privacy_policy_url', 'terms_of_service_url'));

-- Fix the is_admin() function to handle when no profile exists (returns false instead of error)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE firebase_uid = auth.uid()::text LIMIT 1), 
    false
  )
$$;

-- Fix get_profile_id() to be more robust
CREATE OR REPLACE FUNCTION public.get_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE firebase_uid = auth.uid()::text LIMIT 1
$$;

-- Drop problematic policies on assignments that compare to auth.uid() as UUID
DROP POLICY IF EXISTS "assignments_user_read_own" ON public.assignments;

-- Recreate with proper Firebase UID handling
CREATE POLICY "assignments_user_read_own_firebase" 
ON public.assignments 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM bookings b 
  WHERE b.id = assignments.booking_id 
  AND b.user_id = public.get_profile_id()
));

-- Fix booking_assignments policies
DROP POLICY IF EXISTS "booking_assignments_user_select" ON public.booking_assignments;

CREATE POLICY "booking_assignments_user_select_firebase" 
ON public.booking_assignments 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM bookings b 
  WHERE b.id = booking_assignments.booking_id 
  AND b.user_id = public.get_profile_id()
));

-- Fix booking_events policies
DROP POLICY IF EXISTS "booking_events_user_own" ON public.booking_events;

CREATE POLICY "booking_events_user_own_firebase" 
ON public.booking_events 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM bookings b 
  WHERE b.id = booking_events.booking_id 
  AND b.user_id = public.get_profile_id()
));

-- Fix booking_messages policies
DROP POLICY IF EXISTS "user_insert_booking_messages" ON public.booking_messages;
DROP POLICY IF EXISTS "user_select_booking_messages" ON public.booking_messages;

CREATE POLICY "user_select_booking_messages_firebase" 
ON public.booking_messages 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM bookings b 
  WHERE b.id = booking_messages.booking_id 
  AND b.user_id = public.get_profile_id()
));

CREATE POLICY "user_insert_booking_messages_firebase" 
ON public.booking_messages 
FOR INSERT 
WITH CHECK (
  sender_id = public.get_profile_id() 
  AND sender_role = 'user' 
  AND EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = booking_messages.booking_id 
    AND b.user_id = public.get_profile_id()
  )
);

-- Fix booking_status_history policies
DROP POLICY IF EXISTS "bsh_user_select_own" ON public.booking_status_history;

CREATE POLICY "bsh_user_select_own_firebase" 
ON public.booking_status_history 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM bookings b 
  WHERE b.id = booking_status_history.booking_id 
  AND b.user_id = public.get_profile_id()
));

-- Fix device_tokens policies  
DROP POLICY IF EXISTS "tokens by user" ON public.device_tokens;

CREATE POLICY "device_tokens_user_all_firebase" 
ON public.device_tokens 
FOR ALL 
USING (user_id = public.get_profile_id())
WITH CHECK (user_id = public.get_profile_id());