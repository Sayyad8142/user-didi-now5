-- Fix security vulnerability: Remove public worker registration
-- Only admins should be able to add workers to prevent unauthorized access to customer data

-- Drop the insecure policy that allows anyone to register as a worker
DROP POLICY IF EXISTS "Allow worker registration" ON public.workers;

-- Ensure all worker data access requires proper authorization
-- The existing admin policies are secure and should remain:
-- - secure_workers_admin_insert: Only admins can insert workers
-- - secure_workers_admin_select: Only admins can view all worker data  
-- - secure_workers_admin_update: Only admins can update workers
-- - secure_workers_admin_delete: Only admins can delete workers
-- - workers_customer_assigned_minimal_info: Customers can only see minimal info of their assigned workers

-- Update the register_worker function to only allow admin approval workflow
-- This function should create a "pending" worker record that requires admin approval
CREATE OR REPLACE FUNCTION public.register_worker_request(
  p_full_name text, 
  p_phone text, 
  p_upi_id text, 
  p_service_types text[], 
  p_community text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result json;
BEGIN
  -- Validate inputs
  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;
  
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;
  
  IF p_upi_id IS NULL OR trim(p_upi_id) = '' THEN
    RAISE EXCEPTION 'UPI ID is required';
  END IF;
  
  IF p_service_types IS NULL OR array_length(p_service_types, 1) = 0 THEN
    RAISE EXCEPTION 'At least one service type is required';
  END IF;
  
  IF p_community IS NULL OR trim(p_community) = '' THEN
    RAISE EXCEPTION 'Community is required';
  END IF;

  -- Store worker registration request in a separate table for admin approval
  -- This prevents unauthorized workers from being created directly
  INSERT INTO public.worker_registration_requests (
    full_name,
    phone,
    upi_id,
    service_types,
    community,
    status
  ) VALUES (
    trim(p_full_name),
    p_phone,
    trim(p_upi_id),
    p_service_types,
    trim(p_community),
    'pending'
  );

  v_result := json_build_object(
    'status', 'success',
    'message', 'Registration request submitted successfully! Admin approval required.'
  );

  RETURN v_result;
END;
$$;

-- Create worker registration requests table for admin approval workflow
CREATE TABLE IF NOT EXISTS public.worker_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  upi_id text NOT NULL,
  service_types text[] NOT NULL,
  community text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text
);

-- Enable RLS on worker registration requests
ALTER TABLE public.worker_registration_requests ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage registration requests
CREATE POLICY "Admin can manage worker registration requests" 
ON public.worker_registration_requests
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Allow public to submit registration requests only
CREATE POLICY "Allow public to submit registration requests"
ON public.worker_registration_requests  
FOR INSERT
TO public
WITH CHECK (status = 'pending');

-- Add trigger for updated_at
CREATE TRIGGER update_worker_registration_requests_updated_at
  BEFORE UPDATE ON public.worker_registration_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Admin function to approve worker registration
CREATE OR REPLACE FUNCTION public.admin_approve_worker_registration(
  p_request_id uuid,
  p_photo_url text DEFAULT NULL
) RETURNS public.workers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request public.worker_registration_requests;
  v_worker public.workers;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied (admin only)' USING ERRCODE = '42501';
  END IF;

  -- Get the registration request
  SELECT * INTO v_request 
  FROM public.worker_registration_requests 
  WHERE id = p_request_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request not found or already processed';
  END IF;

  -- Create the worker
  INSERT INTO public.workers (
    full_name,
    phone, 
    upi_id,
    service_types,
    community,
    photo_url,
    is_active,
    is_available
  ) VALUES (
    v_request.full_name,
    v_request.phone,
    v_request.upi_id, 
    v_request.service_types,
    v_request.community,
    p_photo_url,
    true,
    false
  ) RETURNING * INTO v_worker;

  -- Mark request as approved
  UPDATE public.worker_registration_requests 
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN v_worker;
END;
$$;

-- Admin function to reject worker registration  
CREATE OR REPLACE FUNCTION public.admin_reject_worker_registration(
  p_request_id uuid,
  p_rejection_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied (admin only)' USING ERRCODE = '42501';
  END IF;

  UPDATE public.worker_registration_requests 
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = p_rejection_reason,
      updated_at = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration request not found or already processed';
  END IF;
END;
$$;