-- Enable real-time for support_messages table if not already enabled
-- First check if the table is already in the publication
DO $$
BEGIN
  -- Add support_messages to realtime publication if not already there
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
    RAISE NOTICE 'Added support_messages to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'support_messages already in supabase_realtime publication';
  END IF;
  
  -- Add support_threads to realtime publication if not already there
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'support_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE support_threads;
    RAISE NOTICE 'Added support_threads to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'support_threads already in supabase_realtime publication';
  END IF;
END $$;

-- Ensure replica identity is set to FULL for complete row data in realtime updates
ALTER TABLE support_messages REPLICA IDENTITY FULL;
ALTER TABLE support_threads REPLICA IDENTITY FULL;