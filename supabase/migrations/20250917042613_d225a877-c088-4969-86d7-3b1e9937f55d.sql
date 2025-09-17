-- Enable Row Level Security (RLS) on tables missing it

-- Enable RLS on booking_requests table
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for booking_requests - only workers can see their own requests
CREATE POLICY "booking_requests_worker_select_own" 
ON public.booking_requests 
FOR SELECT 
USING (worker_id = auth.uid());

-- Add RLS policy for booking_requests - only workers can update their own requests
CREATE POLICY "booking_requests_worker_update_own" 
ON public.booking_requests 
FOR UPDATE 
USING (worker_id = auth.uid())
WITH CHECK (worker_id = auth.uid());

-- Admin access for booking_requests
CREATE POLICY "booking_requests_admin_all" 
ON public.booking_requests 
FOR ALL 
USING (is_admin())
WITH CHECK (is_admin());

-- Enable RLS on fcm_tokens table
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for fcm_tokens - only workers can manage their own tokens
CREATE POLICY "fcm_tokens_worker_select_own" 
ON public.fcm_tokens 
FOR SELECT 
USING (worker_id = auth.uid());

CREATE POLICY "fcm_tokens_worker_insert_own" 
ON public.fcm_tokens 
FOR INSERT 
WITH CHECK (worker_id = auth.uid());

CREATE POLICY "fcm_tokens_worker_update_own" 
ON public.fcm_tokens 
FOR UPDATE 
USING (worker_id = auth.uid())
WITH CHECK (worker_id = auth.uid());

CREATE POLICY "fcm_tokens_worker_delete_own" 
ON public.fcm_tokens 
FOR DELETE 
USING (worker_id = auth.uid());

-- Admin access for fcm_tokens
CREATE POLICY "fcm_tokens_admin_all" 
ON public.fcm_tokens 
FOR ALL 
USING (is_admin())
WITH CHECK (is_admin());

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for users - users can only see and modify their own records
CREATE POLICY "users_select_own" 
ON public.users 
FOR SELECT 
USING (id = auth.uid());

CREATE POLICY "users_insert_own" 
ON public.users 
FOR INSERT 
WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own" 
ON public.users 
FOR UPDATE 
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Admin access for users
CREATE POLICY "users_admin_all" 
ON public.users 
FOR ALL 
USING (is_admin())
WITH CHECK (is_admin());