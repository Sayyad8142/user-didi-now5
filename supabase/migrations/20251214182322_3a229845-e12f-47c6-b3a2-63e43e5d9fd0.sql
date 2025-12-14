-- Drop old conflicting policies that compare auth.uid() to UUID id
DROP POLICY IF EXISTS "profiles_insert_authenticated_own_only" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated_own_only" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_authenticated_own_only" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin_authenticated_only" ON public.profiles;
DROP POLICY IF EXISTS "profiles_deny_anonymous_all" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;

-- Ensure the firebase_uid based policies are in place
-- Drop and recreate to ensure they're correct
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

-- Allow users to select their own profile
CREATE POLICY "profiles_select_own" 
ON public.profiles 
FOR SELECT 
USING (firebase_uid = auth.uid()::text);

-- Allow users to update their own profile
CREATE POLICY "profiles_update_own" 
ON public.profiles 
FOR UPDATE 
USING (firebase_uid = auth.uid()::text)
WITH CHECK (firebase_uid = auth.uid()::text);

-- Allow users to insert their own profile
CREATE POLICY "profiles_insert_own" 
ON public.profiles 
FOR INSERT 
WITH CHECK (firebase_uid = auth.uid()::text);