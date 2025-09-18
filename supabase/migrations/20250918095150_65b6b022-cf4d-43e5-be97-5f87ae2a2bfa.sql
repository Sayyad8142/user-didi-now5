-- Fix conflicting RLS policies for support_messages
-- Drop the conflicting policies and create clear, non-overlapping ones

-- Drop existing conflicting policies
DROP POLICY IF EXISTS "sm_user_insert" ON public.support_messages;
DROP POLICY IF EXISTS "sm_user_own_thread" ON public.support_messages;

-- Create clear, non-conflicting policies
-- Policy for users to insert messages into their own threads
CREATE POLICY "support_messages_user_insert_own_thread" 
ON public.support_messages 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.support_threads t 
    WHERE t.id = support_messages.thread_id 
    AND t.user_id = auth.uid()
  )
);

-- Policy for users to select messages from their own threads  
CREATE POLICY "support_messages_user_select_own_thread" 
ON public.support_messages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.support_threads t 
    WHERE t.id = support_messages.thread_id 
    AND t.user_id = auth.uid()
  )
);

-- Policy for users to update messages from their own threads (if needed)
CREATE POLICY "support_messages_user_update_own_thread" 
ON public.support_messages 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.support_threads t 
    WHERE t.id = support_messages.thread_id 
    AND t.user_id = auth.uid()
  )
) 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.support_threads t 
    WHERE t.id = support_messages.thread_id 
    AND t.user_id = auth.uid()
  )
);