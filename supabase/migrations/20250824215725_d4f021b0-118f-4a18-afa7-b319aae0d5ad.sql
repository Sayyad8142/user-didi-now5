-- Fix critical security vulnerabilities in bookings table RLS policies

-- Step 1: Drop all existing duplicate and vulnerable policies
DROP POLICY IF EXISTS "Users can create their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can view their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_self" ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_admin" ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_self" ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_admin" ON public.bookings;

-- Step 2: Create secure policies with proper access control

-- Policy 1: Users can only view their own bookings
CREATE POLICY "secure_bookings_select_own" 
ON public.bookings 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Policy 2: Admins can view all bookings (using security definer function)
CREATE POLICY "secure_bookings_select_admin" 
ON public.bookings 
FOR SELECT 
TO authenticated
USING (public.is_admin());

-- Policy 3: Users can only insert bookings for themselves
CREATE POLICY "secure_bookings_insert_own" 
ON public.bookings 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can only update their own bookings
CREATE POLICY "secure_bookings_update_own" 
ON public.bookings 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 5: Admins can update any booking (for assignment, status changes)
CREATE POLICY "secure_bookings_update_admin" 
ON public.bookings 
FOR UPDATE 
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Step 3: Ensure no DELETE access for extra security
-- (No DELETE policy = no one can delete bookings, which protects audit trail)

-- Step 4: Add worker_rating_stats RLS protection (found in security scan)
ALTER TABLE public.worker_rating_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view worker rating statistics
CREATE POLICY "secure_worker_stats_admin_only" 
ON public.worker_rating_stats 
FOR SELECT 
TO authenticated
USING (public.is_admin());

-- Policy: Only system can update worker stats (through triggers/functions)
CREATE POLICY "secure_worker_stats_system_only" 
ON public.worker_rating_stats 
FOR ALL 
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());