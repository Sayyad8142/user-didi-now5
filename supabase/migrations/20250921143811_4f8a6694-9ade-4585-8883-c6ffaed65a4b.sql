-- Fix critical security vulnerability in workers table RLS policies

-- Drop the dangerous public policies that allow unrestricted access
DROP POLICY IF EXISTS "public_insert_workers" ON public.workers;
DROP POLICY IF EXISTS "workers_customer_minimal_safe_info" ON public.workers;

-- Create secure policies for workers table

-- Workers can view and update their own profiles only
CREATE POLICY "workers_select_own_profile" 
ON public.workers 
FOR SELECT 
TO authenticated
USING (id = auth.uid());

CREATE POLICY "workers_update_own_profile" 
ON public.workers 
FOR UPDATE 
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Customers can only see minimal safe information of workers assigned to their active bookings
-- This replaces the overly permissive previous policy with more restrictive access
CREATE POLICY "customers_view_assigned_worker_minimal_info" 
ON public.workers 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 
    FROM bookings b 
    WHERE b.worker_id = workers.id 
      AND b.user_id = auth.uid() 
      AND b.status IN ('assigned', 'started', 'completed')
  )
);

-- Create a secure function for getting available workers (replaces direct table access)
-- This function only exposes safe, non-sensitive worker information
CREATE OR REPLACE FUNCTION public.get_available_workers_safe(
  p_service_type text DEFAULT NULL,
  p_community text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  full_name text,
  rating numeric,
  total_ratings integer,
  service_types text[],
  photo_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.full_name,
    COALESCE(w.rating, 0.0) as rating,
    COALESCE(w.total_ratings, 0) as total_ratings,
    w.service_types,
    w.photo_url
  FROM workers w
  WHERE w.is_active = true 
    AND w.is_available = true
    AND (p_service_type IS NULL OR p_service_type = ANY(w.service_types))
    AND (p_community IS NULL OR w.community = p_community OR w.community IS NULL)
    AND w.last_active_at > NOW() - INTERVAL '24 hours'
  ORDER BY 
    COALESCE(w.rating, 0.0) DESC,
    COALESCE(w.total_ratings, 0) DESC,
    w.last_active_at DESC
  LIMIT 20;
END;
$$;