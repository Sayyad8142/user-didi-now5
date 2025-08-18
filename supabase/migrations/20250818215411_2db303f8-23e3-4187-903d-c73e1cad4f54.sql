-- Drop existing problematic policies on workers table
DROP POLICY IF EXISTS "Admins can read workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can insert workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can update workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can delete workers" ON public.workers;

-- Create comprehensive RLS policies for workers table that allow admins full access
CREATE POLICY "Admins can select workers"
ON public.workers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Admins can insert workers"
ON public.workers
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Admins can update workers"
ON public.workers
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Admins can delete workers"
ON public.workers
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);