-- Fix security vulnerability: Restrict read access to sensitive contact data
-- This addresses the security findings about customer contact information exposure

-- First, drop the existing overly permissive SELECT policies
DROP POLICY IF EXISTS "Authenticated admins can view contact leads" ON public.contact_leads;
DROP POLICY IF EXISTS "Admins can view callback requests" ON public.callback_requests;

-- Create new, properly restricted SELECT policies for admins only
-- These policies ensure only authenticated admin users can read sensitive contact data

CREATE POLICY "contact_leads_admin_select" 
ON public.contact_leads 
FOR SELECT 
TO authenticated
USING (is_admin());

CREATE POLICY "callback_requests_admin_select" 
ON public.callback_requests 
FOR SELECT 
TO authenticated  
USING (is_admin());

-- Also ensure worker registration requests has proper SELECT policy
DROP POLICY IF EXISTS "worker_registration_requests_admin_select" ON public.worker_registration_requests;

CREATE POLICY "worker_registration_requests_admin_select"
ON public.worker_registration_requests
FOR SELECT
TO authenticated
USING (is_admin());

-- Add comments for clarity
COMMENT ON POLICY "contact_leads_admin_select" ON public.contact_leads IS 'Restricts read access to contact leads to authenticated admin users only';
COMMENT ON POLICY "callback_requests_admin_select" ON public.callback_requests IS 'Restricts read access to callback requests to authenticated admin users only';
COMMENT ON POLICY "worker_registration_requests_admin_select" ON public.worker_registration_requests IS 'Restricts read access to worker registration requests to authenticated admin users only';