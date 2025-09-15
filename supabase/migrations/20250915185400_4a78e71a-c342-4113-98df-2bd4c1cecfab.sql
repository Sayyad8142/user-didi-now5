-- Fix Security Definer View issue
-- Remove the security definer view and rely on proper RLS policies and secure functions

-- Drop the problematic security definer view
DROP VIEW IF EXISTS public.worker_customer_view;

-- The security is now properly handled by:
-- 1. The restrictive RLS policy "workers_customer_minimal_safe_info" on the workers table
-- 2. The secure functions get_assigned_worker_safe_info() and get_assigned_worker_info()
--    which use SECURITY DEFINER and SET search_path = public for safe access

-- Verify the RLS policy is properly restrictive
-- (This policy already exists from the previous migration but ensuring it's documented)
-- The policy ensures customers can only see worker info for their assigned bookings
-- and only exposes safe, non-sensitive worker information