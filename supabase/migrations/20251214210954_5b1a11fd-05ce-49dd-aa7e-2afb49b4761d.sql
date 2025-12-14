-- Drop existing insert policy if any
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profiles" ON public.profiles;

-- Create new insert policy using firebase_uid
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (firebase_uid = auth.uid()::text);

-- Ensure update policy also uses firebase_uid
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (firebase_uid = auth.uid()::text)
WITH CHECK (firebase_uid = auth.uid()::text);

-- Ensure select policy also uses firebase_uid
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (firebase_uid = auth.uid()::text);