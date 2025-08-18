-- Allow admins to manage workers via RLS policies
-- Ensure RLS is enabled (safe if already enabled)
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies with these names to avoid duplicates
DROP POLICY IF EXISTS "Admins can read workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can insert workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can update workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can delete workers" ON public.workers;

-- Read policy for admins
CREATE POLICY "Admins can read workers"
ON public.workers
FOR SELECT
USING (public.is_admin());

-- Insert policy for admins
CREATE POLICY "Admins can insert workers"
ON public.workers
FOR INSERT
WITH CHECK (public.is_admin());

-- Update policy for admins
CREATE POLICY "Admins can update workers"
ON public.workers
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Delete policy for admins
CREATE POLICY "Admins can delete workers"
ON public.workers
FOR DELETE
USING (public.is_admin());