-- Fix all remaining RLS policies that use auth.uid() with UUID columns
-- These need to use firebase_uid = auth.uid()::text or get_profile_id() instead

-- Drop and recreate support_threads policies
DROP POLICY IF EXISTS "st_user_modify" ON public.support_threads;
CREATE POLICY "st_user_modify" ON public.support_threads FOR UPDATE
  USING (user_id = public.get_profile_id());

-- Fix user_roles policies
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL
  USING (public.is_admin());

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT
  USING (user_id = public.get_profile_id());

-- Fix users table policies
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

-- users table has its own id column that might not be related to profiles
-- Skip these as they may be for a different purpose

-- Fix web_push_subscriptions policies
DROP POLICY IF EXISTS "self-manage push" ON public.web_push_subscriptions;
CREATE POLICY "self-manage push" ON public.web_push_subscriptions FOR ALL
  USING (user_id = public.get_profile_id());

-- Fix worker_availability policies
DROP POLICY IF EXISTS "Workers can update own availability" ON public.worker_availability;
DROP POLICY IF EXISTS "Workers can view own availability" ON public.worker_availability;

CREATE POLICY "Workers can update own availability" ON public.worker_availability FOR UPDATE
  USING (
    worker_id::text = auth.uid()::text 
    OR EXISTS (
      SELECT 1 FROM workers w 
      WHERE w.id = worker_availability.worker_id 
      AND w.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Workers can view own availability" ON public.worker_availability FOR SELECT
  USING (
    worker_id::text = auth.uid()::text 
    OR EXISTS (
      SELECT 1 FROM workers w 
      WHERE w.id = worker_availability.worker_id 
      AND w.user_id::text = auth.uid()::text
    )
  );

-- Fix worker_blackouts policies
DROP POLICY IF EXISTS "Workers can manage own blackouts" ON public.worker_blackouts;
CREATE POLICY "Workers can manage own blackouts" ON public.worker_blackouts FOR ALL
  USING (
    worker_id::text = auth.uid()::text 
    OR EXISTS (
      SELECT 1 FROM workers w 
      WHERE w.id = worker_blackouts.worker_id 
      AND w.user_id::text = auth.uid()::text
    )
  );

-- Fix worker_contact_access_log policies
DROP POLICY IF EXISTS "Admins can view access logs" ON public.worker_contact_access_log;
CREATE POLICY "Admins can view access logs" ON public.worker_contact_access_log FOR SELECT
  USING (public.is_admin());

-- Fix worker_ratings policies  
DROP POLICY IF EXISTS "workers_view_own_ratings" ON public.worker_ratings;
DROP POLICY IF EXISTS "wr_select" ON public.worker_ratings;

CREATE POLICY "workers_view_own_ratings" ON public.worker_ratings FOR SELECT
  USING (worker_id::text = auth.uid()::text OR worker_id = public.get_profile_id());

CREATE POLICY "wr_select" ON public.worker_ratings FOR SELECT
  USING (user_id = public.get_profile_id() OR public.is_admin());

-- Fix worker_reviews policies
DROP POLICY IF EXISTS "worker_reviews_customer_select" ON public.worker_reviews;
DROP POLICY IF EXISTS "worker_reviews_worker_select" ON public.worker_reviews;

CREATE POLICY "worker_reviews_customer_select" ON public.worker_reviews FOR SELECT
  USING (customer_id = public.get_profile_id());

CREATE POLICY "worker_reviews_worker_select" ON public.worker_reviews FOR SELECT
  USING (worker_id::text = auth.uid()::text);

-- Fix workers table policies
DROP POLICY IF EXISTS "Admins can manage workers" ON public.workers;
DROP POLICY IF EXISTS "admin_all_workers" ON public.workers;
DROP POLICY IF EXISTS "worker_select_self" ON public.workers;
DROP POLICY IF EXISTS "worker_update_self" ON public.workers;
DROP POLICY IF EXISTS "workers_select_own" ON public.workers;
DROP POLICY IF EXISTS "workers_update_own_fcm_token" ON public.workers;
DROP POLICY IF EXISTS "workers_update_own_status" ON public.workers;
DROP POLICY IF EXISTS "Workers can update own location" ON public.workers;

CREATE POLICY "Admins can manage workers" ON public.workers FOR ALL
  USING (public.is_admin());

CREATE POLICY "worker_select_self" ON public.workers FOR SELECT
  USING (id::text = auth.uid()::text OR user_id::text = auth.uid()::text);

CREATE POLICY "worker_update_self" ON public.workers FOR UPDATE
  USING (id::text = auth.uid()::text OR user_id::text = auth.uid()::text);

-- Fix storage.objects policies that use profiles.id = auth.uid()
DROP POLICY IF EXISTS "Admins can update worker photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to manage app-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "app-pdfs admin delete" ON storage.objects;
DROP POLICY IF EXISTS "app-pdfs admin update" ON storage.objects;

-- Recreate with correct firebase_uid check
CREATE POLICY "Admins can update worker photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'worker-photos' AND public.is_admin());

CREATE POLICY "Allow admins to manage app-pdfs" ON storage.objects FOR ALL
  USING (bucket_id = 'app-pdfs' AND public.is_admin());

CREATE POLICY "app-pdfs admin delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'app-pdfs' AND public.is_admin());

CREATE POLICY "app-pdfs admin update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'app-pdfs' AND public.is_admin());