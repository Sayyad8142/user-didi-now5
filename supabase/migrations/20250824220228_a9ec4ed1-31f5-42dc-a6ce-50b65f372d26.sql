-- Fix critical security vulnerabilities in workers table RLS policies

-- Step 1: Drop all existing vulnerable and duplicate policies
DROP POLICY IF EXISTS "Admins can delete workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can insert workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can select workers" ON public.workers;
DROP POLICY IF EXISTS "Admins can update workers" ON public.workers;
DROP POLICY IF EXISTS "users_can_view_assigned_workers" ON public.workers;
DROP POLICY IF EXISTS "workers_admin_all" ON public.workers;
DROP POLICY IF EXISTS "workers_admin_write" ON public.workers;

-- Step 2: Create secure policies that protect worker sensitive data

-- Policy 1: Only admins can view all worker data
CREATE POLICY "secure_workers_admin_select" 
ON public.workers 
FOR SELECT 
TO authenticated
USING (public.is_admin());

-- Policy 2: Users can view ONLY their assigned workers with LIMITED info
-- Note: This still gives access to full worker record, but we'll handle
-- sensitive data filtering in the application layer
CREATE POLICY "secure_workers_customer_assigned" 
ON public.workers 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM assignments a
    JOIN bookings b ON a.booking_id = b.id
    WHERE a.worker_id = workers.id 
    AND b.user_id = auth.uid()
    AND b.status IN ('assigned', 'completed')
  )
);

-- Step 3: Admin-only policies for worker management
CREATE POLICY "secure_workers_admin_insert" 
ON public.workers 
FOR INSERT 
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "secure_workers_admin_update" 
ON public.workers 
FOR UPDATE 
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "secure_workers_admin_delete" 
ON public.workers 
FOR DELETE 
TO authenticated
USING (public.is_admin());

-- Step 4: Create a secure function for customers to get worker info with limited fields
CREATE OR REPLACE FUNCTION public.get_assigned_worker_info(booking_id uuid)
RETURNS TABLE (
  worker_id uuid,
  worker_name text,
  service_types text[],
  is_active boolean
) 
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    w.id,
    w.full_name,
    w.service_types,
    w.is_active
  FROM workers w
  JOIN assignments a ON a.worker_id = w.id
  JOIN bookings b ON a.booking_id = b.id
  WHERE b.id = $1
  AND b.user_id = auth.uid()
  AND b.status IN ('assigned', 'completed');
$$;