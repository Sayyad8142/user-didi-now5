-- Add firebase_uid column to profiles for Firebase authentication
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;

-- Create index for faster lookups by firebase_uid
CREATE INDEX IF NOT EXISTS idx_profiles_firebase_uid ON public.profiles(firebase_uid);

-- Update RLS policies to allow access by firebase_uid
-- Drop existing policies if they reference auth.uid() incorrectly
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create new policies that work with firebase_uid
-- For Firebase JWT auth, auth.uid() returns the Firebase UID as text
CREATE POLICY "Users can view their own profile by firebase_uid" 
ON public.profiles 
FOR SELECT 
USING (firebase_uid = auth.uid()::text OR firebase_uid IS NULL);

CREATE POLICY "Users can update their own profile by firebase_uid" 
ON public.profiles 
FOR UPDATE 
USING (firebase_uid = auth.uid()::text);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (firebase_uid = auth.uid()::text);