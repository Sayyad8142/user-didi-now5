-- Enable real-time for support tables
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER TABLE public.support_threads REPLICA IDENTITY FULL;

-- Add tables to realtime publication if not already there
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  EXCEPTION 
    WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
  EXCEPTION 
    WHEN duplicate_object THEN NULL;
  END;
END
$$;

-- Create a trigger to update the support_threads.updated_at when a new message is added
CREATE OR REPLACE FUNCTION public.update_support_thread_on_message()
RETURNS trigger AS $$
BEGIN
  UPDATE public.support_threads 
  SET 
    updated_at = NOW(),
    last_message = NEW.message,
    last_sender = NEW.sender
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_support_thread_trigger ON public.support_messages;

-- Create the trigger
CREATE TRIGGER update_support_thread_trigger
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_support_thread_on_message();