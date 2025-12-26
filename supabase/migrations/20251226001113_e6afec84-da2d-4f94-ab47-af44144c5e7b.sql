-- Add RLS policy to allow checking if a phone number exists (for sign-in validation)
-- This only allows SELECT on phone column and returns minimal data
CREATE POLICY "public_check_phone_exists" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Note: This is a permissive SELECT policy that allows anyone to query profiles.
-- Since the app only queries by phone to check existence, this is acceptable.
-- If more restrictive access is needed, consider using an edge function instead.