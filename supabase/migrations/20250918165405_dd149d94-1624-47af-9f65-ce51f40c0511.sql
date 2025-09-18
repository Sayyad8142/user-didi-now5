-- Add function to mark support messages as seen
CREATE OR REPLACE FUNCTION public.mark_support_messages_as_seen(p_thread_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark all admin messages in the thread as seen
  UPDATE public.support_messages 
  SET seen = true, seen_at = NOW()
  WHERE thread_id = p_thread_id 
    AND sender = 'admin' 
    AND seen = false;
END;
$$;