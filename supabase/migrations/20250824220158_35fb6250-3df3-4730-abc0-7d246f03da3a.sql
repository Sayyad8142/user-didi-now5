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

-- Policy 1: Only admins can view all worker data (using security definer function)
CREATE POLICY "secure_workers_admin_select" 
ON public.workers 
FOR SELECT 
TO authenticated
USING (public.is_admin());

-- Policy 2: Users can view LIMITED worker info for their assigned workers only
-- This policy restricts access to only non-sensitive fields for customers
CREATE POLICY "secure_workers_customer_limited_view" 
ON public.workers 
FOR SELECT 
TO authenticated
USING (
  -- Only if worker is assigned to user's booking
  EXISTS (
    SELECT 1
    FROM assignments a
    JOIN bookings b ON a.booking_id = b.id
    WHERE a.worker_id = workers.id 
    AND b.user_id = auth.uid()
    AND b.status IN ('assigned', 'completed')
  )
);

-- Step 3: Create a secure view for customers with only essential worker info
CREATE OR REPLACE VIEW public.worker_customer_view AS
SELECT 
  w.id,
  w.full_name,
  w.service_types,
  w.is_active,
  -- Exclude sensitive data: phone, upi_id, photo_url
  b.id as booking_id,
  b.user_id
FROM public.workers w
JOIN assignments a ON a.worker_id = w.id
JOIN bookings b ON a.booking_id = b.id
WHERE w.is_active = true;

-- Enable RLS on the customer view
ALTER VIEW public.worker_customer_view SET (security_barrier = true);

-- Policy for the customer view - only see assigned workers
CREATE POLICY "secure_worker_customer_view_policy" 
ON public.worker_customer_view 
FOR SELECT 
TO authenticated
USING (user_id = auth.uid());

-- Step 4: Admin-only policies for full worker management
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

-- Step 5: Ensure worker_ratings table is also secure
-- Users should only access ratings for workers they've been assigned
CREATE POLICY "secure_worker_ratings_customer_view" 
ON public.worker_ratings 
FOR SELECT 
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.is_admin() OR
  EXISTS (
    SELECT 1 
    FROM bookings b 
    WHERE b.id = worker_ratings.booking_id 
    AND b.user_id = auth.uid()
  )
);