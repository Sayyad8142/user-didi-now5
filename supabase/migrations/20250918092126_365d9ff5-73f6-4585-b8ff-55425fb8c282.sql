-- Fix RLS disabled errors for the tables mentioned in the linter
-- Enable RLS on pushcut_debug_log 
ALTER TABLE public.pushcut_debug_log ENABLE ROW LEVEL SECURITY;

-- Create policy for pushcut_debug_log (admin only)
CREATE POLICY "pushcut_debug_log_admin_only" ON public.pushcut_debug_log
FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Enable RLS on support_pushcut_throttle
ALTER TABLE public.support_pushcut_throttle ENABLE ROW LEVEL SECURITY;

-- Create policy for support_pushcut_throttle (admin only) 
CREATE POLICY "support_pushcut_throttle_admin_only" ON public.support_pushcut_throttle
FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Enable RLS on notification_queue
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Create policy for notification_queue (admin only)
CREATE POLICY "notification_queue_admin_only" ON public.notification_queue
FOR ALL USING (is_admin()) WITH CHECK (is_admin());