-- Drop existing policies that don't work with Firebase auth
DROP POLICY IF EXISTS "Users can view their own profile by firebase_uid" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile by firebase_uid" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create new policies that properly handle Firebase auth
-- For Firebase JWT, auth.uid()::text returns the Firebase UID

-- Allow reading own profile by firebase_uid
CREATE POLICY "profiles_select_own" 
ON public.profiles 
FOR SELECT 
USING (firebase_uid = auth.uid()::text);

-- Allow admins to read all profiles
CREATE POLICY "profiles_select_admin" 
ON public.profiles 
FOR SELECT 
USING (is_admin());

-- Allow updating own profile by firebase_uid
CREATE POLICY "profiles_update_own" 
ON public.profiles 
FOR UPDATE 
USING (firebase_uid = auth.uid()::text)
WITH CHECK (firebase_uid = auth.uid()::text);

-- Allow inserting with own firebase_uid
CREATE POLICY "profiles_insert_own" 
ON public.profiles 
FOR INSERT 
WITH CHECK (firebase_uid = auth.uid()::text);

-- Allow admins full access
CREATE POLICY "profiles_admin_all" 
ON public.profiles 
FOR ALL 
USING (is_admin())
WITH CHECK (is_admin());