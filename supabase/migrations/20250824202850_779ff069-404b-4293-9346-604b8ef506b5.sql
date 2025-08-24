-- Enable realtime for support tables (skip constraint since it already exists)
ALTER TABLE public.support_threads REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- Create trigger to update support_threads when new messages arrive (if not exists)
DROP TRIGGER IF EXISTS support_update_thread_trigger ON public.support_messages;