-- Secure contact_leads: admin-only read, public insert

-- 1) Ensure RLS is enabled
ALTER TABLE public.contact_leads ENABLE ROW LEVEL SECURITY;

-- 2) Restrict SELECT to admins only
DROP POLICY IF EXISTS "Admins can view contact leads" ON public.contact_leads;
CREATE POLICY "Admins can view contact leads"
ON public.contact_leads
FOR SELECT
USING (public.is_admin());

-- 3) Keep public inserts for the contact form
DROP POLICY IF EXISTS "Anyone can submit contact forms" ON public.contact_leads;
CREATE POLICY "Anyone can submit contact forms"
ON public.contact_leads
FOR INSERT
WITH CHECK (true);

-- 4) (Optional but safer) Allow only admins to UPDATE/DELETE
DROP POLICY IF EXISTS "Admins can update contact leads" ON public.contact_leads;
CREATE POLICY "Admins can update contact leads"
ON public.contact_leads
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete contact leads" ON public.contact_leads;
CREATE POLICY "Admins can delete contact leads"
ON public.contact_leads
FOR DELETE
USING (public.is_admin());