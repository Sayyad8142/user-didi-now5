-- Strengthen security for other sensitive tables containing personal data

-- Enhance profiles table security
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin_safe" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;

-- Create enhanced profiles policies
CREATE POLICY "profiles_insert_authenticated_own_only" 
  ON public.profiles 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() = id
  );

CREATE POLICY "profiles_select_authenticated_own_only" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() = id
  );

CREATE POLICY "profiles_select_admin_authenticated_only" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND public.is_admin()
  );

CREATE POLICY "profiles_update_authenticated_own_only" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() = id
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() = id
  );

-- Deny anonymous access to profiles
CREATE POLICY "profiles_deny_anonymous_all" 
  ON public.profiles 
  FOR ALL 
  TO anon
  USING (false);

-- Enhance workers table security (contains personal info like phone numbers)
DROP POLICY IF EXISTS "secure_workers_customer_assigned" ON public.workers;

-- Create more restrictive policy for customer access to worker info
CREATE POLICY "workers_customer_assigned_minimal_info" 
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
        AND b.status IN ('assigned', 'completed')
    )
  );

-- Add comments for documentation
COMMENT ON TABLE public.profiles IS 'Contains sensitive personal information including names, phone numbers, and addresses. Access restricted to profile owners and admins only.';
COMMENT ON TABLE public.workers IS 'Contains worker personal and contact information. Limited access to assigned customers and full access to admins only.';

-- Force RLS on sensitive tables
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workers FORCE ROW LEVEL SECURITY;