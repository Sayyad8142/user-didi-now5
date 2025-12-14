-- Drop all RLS policies that incorrectly compare auth.uid() with UUID columns
-- These cause "invalid input syntax for type uuid" errors with Firebase auth

-- =============================================
-- rtc_calls - uses caller_id/callee_id (UUIDs)
-- =============================================
DROP POLICY IF EXISTS "insert_by_caller" ON public.rtc_calls;
DROP POLICY IF EXISTS "read_own_calls" ON public.rtc_calls;
DROP POLICY IF EXISTS "update_by_parties" ON public.rtc_calls;

-- Create new policies using get_profile_id() to convert Firebase UID to Supabase UUID
CREATE POLICY "rtc_calls_insert_by_caller" ON public.rtc_calls
  FOR INSERT WITH CHECK (get_profile_id() = caller_id);

CREATE POLICY "rtc_calls_select_own" ON public.rtc_calls
  FOR SELECT USING (get_profile_id() = caller_id OR get_profile_id() = callee_id);

CREATE POLICY "rtc_calls_update_by_parties" ON public.rtc_calls
  FOR UPDATE USING (get_profile_id() = caller_id OR get_profile_id() = callee_id)
  WITH CHECK (get_profile_id() = caller_id OR get_profile_id() = callee_id);

-- =============================================
-- experts - uses user_id (UUID)
-- =============================================
DROP POLICY IF EXISTS "Users can insert own expert profile" ON public.experts;
DROP POLICY IF EXISTS "Users can update own expert profile" ON public.experts;
DROP POLICY IF EXISTS "Users can view own expert profile" ON public.experts;
DROP POLICY IF EXISTS "Admins can delete experts" ON public.experts;
DROP POLICY IF EXISTS "Admins can update all experts" ON public.experts;
DROP POLICY IF EXISTS "Admins can view all experts" ON public.experts;

-- Create new policies using firebase_uid comparison via profiles
CREATE POLICY "experts_insert_own" ON public.experts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.firebase_uid = auth.uid()::text 
      AND p.id = experts.user_id
    )
  );

CREATE POLICY "experts_update_own" ON public.experts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.firebase_uid = auth.uid()::text 
      AND p.id = experts.user_id
    )
  );

CREATE POLICY "experts_select_own" ON public.experts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.firebase_uid = auth.uid()::text 
      AND p.id = experts.user_id
    )
  );

CREATE POLICY "experts_admin_all" ON public.experts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =============================================
-- expert_schedules - fix via experts
-- =============================================
DROP POLICY IF EXISTS "experts_manage_own_schedules" ON public.expert_schedules;

CREATE POLICY "expert_schedules_manage_own" ON public.expert_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM experts e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.id = expert_schedules.expert_id 
      AND p.firebase_uid = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM experts e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.id = expert_schedules.expert_id 
      AND p.firebase_uid = auth.uid()::text
    )
  );

-- =============================================
-- support_messages - uses user_id via threads
-- =============================================
DROP POLICY IF EXISTS "sm_user_insert" ON public.support_messages;
DROP POLICY IF EXISTS "sm_user_select" ON public.support_messages;

CREATE POLICY "support_messages_user_insert" ON public.support_messages
  FOR INSERT WITH CHECK (
    sender = 'user' AND EXISTS (
      SELECT 1 FROM support_threads t
      WHERE t.id = support_messages.thread_id 
      AND t.user_id = get_profile_id()
    )
  );

CREATE POLICY "support_messages_user_select" ON public.support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_threads t
      WHERE t.id = support_messages.thread_id 
      AND t.user_id = get_profile_id()
    )
  );

-- =============================================
-- support_threads - uses user_id
-- =============================================
DROP POLICY IF EXISTS "st_user_insert" ON public.support_threads;
DROP POLICY IF EXISTS "st_user_select" ON public.support_threads;
DROP POLICY IF EXISTS "st_user_update" ON public.support_threads;

CREATE POLICY "support_threads_user_insert" ON public.support_threads
  FOR INSERT WITH CHECK (user_id = get_profile_id());

CREATE POLICY "support_threads_user_select" ON public.support_threads
  FOR SELECT USING (user_id = get_profile_id());

CREATE POLICY "support_threads_user_update" ON public.support_threads
  FOR UPDATE USING (user_id = get_profile_id());

-- =============================================
-- notification_logs - worker_id is a workers table UUID (not profile)
-- =============================================
DROP POLICY IF EXISTS "notification_logs_worker_select" ON public.notification_logs;

CREATE POLICY "notification_logs_worker_select" ON public.notification_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = notification_logs.worker_id
      AND w.user_id::text = auth.uid()::text
    )
  );

-- =============================================
-- booking_assignments - worker_id is workers table UUID
-- =============================================
DROP POLICY IF EXISTS "booking_assignments_worker_select" ON public.booking_assignments;
DROP POLICY IF EXISTS "booking_assignments_worker_update" ON public.booking_assignments;

CREATE POLICY "booking_assignments_worker_select_v2" ON public.booking_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = booking_assignments.worker_id
      AND w.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "booking_assignments_worker_update_v2" ON public.booking_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = booking_assignments.worker_id
      AND w.user_id::text = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = booking_assignments.worker_id
      AND w.user_id::text = auth.uid()::text
    )
  );

-- =============================================
-- booking_requests - worker_id is workers table UUID
-- =============================================
DROP POLICY IF EXISTS "booking_requests_worker_select_own" ON public.booking_requests;
DROP POLICY IF EXISTS "booking_requests_worker_update_own" ON public.booking_requests;

CREATE POLICY "booking_requests_worker_select_v2" ON public.booking_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = booking_requests.worker_id
      AND w.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "booking_requests_worker_update_v2" ON public.booking_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = booking_requests.worker_id
      AND w.user_id::text = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = booking_requests.worker_id
      AND w.user_id::text = auth.uid()::text
    )
  );

-- =============================================
-- booking_status_history - worker policies via bookings.worker_id
-- =============================================
DROP POLICY IF EXISTS "history insert own" ON public.booking_status_history;
DROP POLICY IF EXISTS "history read own" ON public.booking_status_history;

CREATE POLICY "bsh_worker_insert" ON public.booking_status_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN workers w ON w.id = b.worker_id
      WHERE b.id = booking_status_history.booking_id
      AND w.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "bsh_worker_select" ON public.booking_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN workers w ON w.id = b.worker_id
      WHERE b.id = booking_status_history.booking_id
      AND w.user_id::text = auth.uid()::text
    )
  );

-- =============================================
-- fcm_tokens - user_id is a UUID (often worker's user_id from workers table)
-- =============================================
DROP POLICY IF EXISTS "fcm_select_self" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_update_self" ON public.fcm_tokens;
DROP POLICY IF EXISTS "fcm_upsert_self" ON public.fcm_tokens;
DROP POLICY IF EXISTS "read_own_fcm_tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "update_own_fcm_token" ON public.fcm_tokens;
DROP POLICY IF EXISTS "upsert_own_fcm_tokens" ON public.fcm_tokens;

-- fcm_tokens.user_id stores auth.uid() directly as text cast to UUID
-- For workers it stores their Supabase auth UUID directly
CREATE POLICY "fcm_tokens_select_own" ON public.fcm_tokens
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "fcm_tokens_insert_own" ON public.fcm_tokens
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "fcm_tokens_update_own" ON public.fcm_tokens
  FOR UPDATE USING (user_id::text = auth.uid()::text)
  WITH CHECK (user_id::text = auth.uid()::text);

-- =============================================
-- search_queries - user_id is UUID 
-- =============================================
DROP POLICY IF EXISTS "search_queries_user_delete" ON public.search_queries;
DROP POLICY IF EXISTS "search_queries_user_insert" ON public.search_queries;
DROP POLICY IF EXISTS "search_queries_user_read" ON public.search_queries;
DROP POLICY IF EXISTS "search_queries_user_update" ON public.search_queries;

CREATE POLICY "search_queries_user_all" ON public.search_queries
  FOR ALL USING (user_id = get_profile_id())
  WITH CHECK (user_id = get_profile_id());