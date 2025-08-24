-- Enable realtime for support tables
ALTER TABLE public.support_threads REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

-- Add tables to realtime publication  
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;