
-- Fix fcm_tokens RLS to allow notifications to workers
-- Add policies for service role and trigger context to read FCM tokens

-- CRITICAL: Allow service role to read FCM tokens for sending notifications
-- This policy enables database triggers and edge functions to send push notifications
DROP POLICY IF EXISTS "fcm_tokens_service_role_read" ON public.fcm_tokens;
CREATE POLICY "fcm_tokens_service_role_read" 
ON public.fcm_tokens 
FOR SELECT 
TO service_role
USING (true);

-- Also allow authenticated role to read tokens when called from trigger context
-- This ensures notification triggers can access FCM tokens
DROP POLICY IF EXISTS "fcm_tokens_trigger_read" ON public.fcm_tokens;
CREATE POLICY "fcm_tokens_trigger_read" 
ON public.fcm_tokens 
FOR SELECT 
TO authenticated
USING (
  -- Allow reading tokens when called from database trigger
  pg_trigger_depth() > 0
  -- Or when user is admin
  OR is_admin()
);

COMMENT ON POLICY "fcm_tokens_service_role_read" ON public.fcm_tokens IS 
'Allows service role (used by edge functions and triggers) to read FCM tokens for sending notifications';

COMMENT ON POLICY "fcm_tokens_trigger_read" ON public.fcm_tokens IS 
'Allows reading FCM tokens from within database triggers for notification dispatch';
