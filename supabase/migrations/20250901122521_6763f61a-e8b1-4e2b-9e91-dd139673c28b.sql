-- Strengthen contact_leads RLS policies to ensure better security
-- Drop existing policies first
DROP POLICY IF EXISTS "Admins can view contact leads" ON public.contact_leads;
DROP POLICY IF EXISTS "Admins can update contact leads" ON public.contact_leads;
DROP POLICY IF EXISTS "Admins can delete contact leads" ON public.contact_leads;

-- Create new restrictive policies that explicitly require authentication for admin operations
CREATE POLICY "Authenticated admins can view contact leads" 
ON public.contact_leads 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND is_admin());

CREATE POLICY "Authenticated admins can update contact leads" 
ON public.contact_leads 
FOR UPDATE 
USING (auth.uid() IS NOT NULL AND is_admin())
WITH CHECK (auth.uid() IS NOT NULL AND is_admin());

CREATE POLICY "Authenticated admins can delete contact leads" 
ON public.contact_leads 
FOR DELETE 
USING (auth.uid() IS NOT NULL AND is_admin());