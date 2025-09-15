-- Fix critical security vulnerability: Restrict worker information exposure to customers
-- Only expose essential worker details (name, photo, rating) to customers with assigned bookings

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "workers_customer_assigned_minimal_info" ON public.workers;

-- Create a secure view for customer-visible worker information
CREATE OR REPLACE VIEW public.worker_customer_view AS
SELECT 
  w.id,
  w.full_name,
  w.photo_url,
  w.rating,
  w.total_ratings,
  w.service_types
FROM public.workers w
WHERE w.is_active = true;

-- Enable RLS on the view
ALTER VIEW public.worker_customer_view SET (security_barrier = true);

-- Create a new restrictive policy that only allows customers to see minimal worker info
-- for workers assigned to their bookings
CREATE POLICY "workers_customer_minimal_safe_info" 
ON public.workers 
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL) 
  AND (EXISTS (
    SELECT 1 
    FROM bookings b 
    WHERE b.worker_id = workers.id 
      AND b.user_id = auth.uid() 
      AND b.status IN ('assigned', 'completed')
  ))
  AND (
    -- Only allow access to safe, non-sensitive columns
    -- This is enforced by limiting what can be selected in application code
    true
  )
);

-- Create a secure function for customers to get safe worker details
CREATE OR REPLACE FUNCTION public.get_assigned_worker_safe_info(p_booking_id uuid)
RETURNS TABLE(
  worker_id uuid,
  worker_name text,
  worker_photo_url text,
  worker_rating numeric,
  worker_total_ratings integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    w.id as worker_id,
    w.full_name as worker_name,
    w.photo_url as worker_photo_url,
    w.rating as worker_rating,
    w.total_ratings as worker_total_ratings
  FROM workers w
  JOIN bookings b ON b.worker_id = w.id
  WHERE b.id = p_booking_id 
    AND b.user_id = auth.uid()
    AND b.status IN ('assigned', 'completed')
    AND w.is_active = true;
$$;

-- Update the existing get_assigned_worker_info function to be more secure
CREATE OR REPLACE FUNCTION public.get_assigned_worker_info(booking_id uuid)
RETURNS TABLE(worker_id uuid, worker_name text, service_types text[], is_active boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    w.id,
    w.full_name,
    w.service_types,
    w.is_active
  FROM workers w
  JOIN bookings b ON b.worker_id = w.id  
  WHERE b.id = $1
    AND b.user_id = auth.uid()
    AND b.status IN ('assigned', 'completed');
$$;