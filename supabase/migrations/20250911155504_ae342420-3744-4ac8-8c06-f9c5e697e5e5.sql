-- Fix security vulnerability in leads table RLS policy
-- Replace hardcoded email check with proper admin function

-- Drop the existing insecure policy
DROP POLICY IF EXISTS "Admin can view all leads" ON public.leads;

-- Create a secure policy using the is_admin() function
CREATE POLICY "Authenticated admins can view leads" 
ON public.leads 
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL) AND is_admin()
);

-- Also add proper UPDATE and DELETE policies for consistency
CREATE POLICY "Authenticated admins can update leads" 
ON public.leads 
FOR UPDATE 
USING (
  (auth.uid() IS NOT NULL) AND is_admin()
)
WITH CHECK (
  (auth.uid() IS NOT NULL) AND is_admin()
);

CREATE POLICY "Authenticated admins can delete leads" 
ON public.leads 
FOR DELETE 
USING (
  (auth.uid() IS NOT NULL) AND is_admin()
);