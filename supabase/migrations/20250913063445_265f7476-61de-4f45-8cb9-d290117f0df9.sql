-- Fix security vulnerability for tenants table
-- Replace the overly permissive policy with a properly restricted one

DROP POLICY IF EXISTS "tenants_admin_all" ON public.tenants;

-- Create separate policies for better security control
CREATE POLICY "tenants_admin_select" 
ON public.tenants 
FOR SELECT 
TO authenticated
USING (is_admin());

CREATE POLICY "tenants_admin_insert" 
ON public.tenants 
FOR INSERT 
TO authenticated
WITH CHECK (is_admin());

CREATE POLICY "tenants_admin_update" 
ON public.tenants 
FOR UPDATE 
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "tenants_admin_delete" 
ON public.tenants 
FOR DELETE 
TO authenticated
USING (is_admin());

-- Add comments for clarity
COMMENT ON POLICY "tenants_admin_select" ON public.tenants IS 'Restricts read access to tenant data to authenticated admin users only';
COMMENT ON POLICY "tenants_admin_insert" ON public.tenants IS 'Restricts insert access to tenant data to authenticated admin users only';
COMMENT ON POLICY "tenants_admin_update" ON public.tenants IS 'Restricts update access to tenant data to authenticated admin users only';
COMMENT ON POLICY "tenants_admin_delete" ON public.tenants IS 'Restricts delete access to tenant data to authenticated admin users only';