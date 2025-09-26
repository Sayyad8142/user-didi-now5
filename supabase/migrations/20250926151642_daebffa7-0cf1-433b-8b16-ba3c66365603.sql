-- Remove the dangerous public read policy that exposes worker personal data
DROP POLICY IF EXISTS "workers_public_read" ON public.workers;

-- Ensure we have proper policies for legitimate use cases:
-- 1. Workers can read their own profile (already exists)
-- 2. Admins can read all workers for management (already exists) 
-- 3. Customers can see minimal info of workers assigned to their bookings (already exists)

-- Optional: Add a more restrictive public policy that only shows non-sensitive data if needed
-- For now, removing public access entirely to fix the security issue