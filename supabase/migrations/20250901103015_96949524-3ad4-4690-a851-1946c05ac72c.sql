-- Add SELECT policy for admins to access callback_requests table
-- This allows admin users to view callback requests while maintaining security

CREATE POLICY "Admins can view callback requests" 
ON public.callback_requests 
FOR SELECT 
USING (is_admin());