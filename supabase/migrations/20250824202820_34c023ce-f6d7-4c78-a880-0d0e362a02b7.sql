-- Fix the foreign key relationship between support_threads and profiles
-- First, let's add the missing foreign key constraint
ALTER TABLE public.support_threads 
ADD CONSTRAINT support_threads_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable realtime for support tables
ALTER TABLE public.support_threads REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- Create trigger to update support_threads when new messages arrive
CREATE OR REPLACE FUNCTION public.support_update_thread()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.support_threads
  SET last_message = NEW.message,
      last_sender = NEW.sender,
      updated_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new messages
DROP TRIGGER IF EXISTS support_update_thread_trigger ON public.support_messages;
CREATE TRIGGER support_update_thread_trigger
    AFTER INSERT ON public.support_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.support_update_thread();