-- First, update any existing rows with invalid status to 'ringing'
UPDATE public.rtc_calls 
SET status = 'ringing' 
WHERE status NOT IN ('ringing', 'active', 'completed', 'failed', 'rejected');

-- Enable realtime for rtc_calls table
ALTER TABLE public.rtc_calls REPLICA IDENTITY FULL;

-- Add to realtime publication (ignore if already exists)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rtc_calls;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "party_read" ON public.rtc_calls;
DROP POLICY IF EXISTS "caller_insert" ON public.rtc_calls;
DROP POLICY IF EXISTS "party_update" ON public.rtc_calls;

-- Create comprehensive RLS policies
CREATE POLICY "read_own_calls" 
ON public.rtc_calls 
FOR SELECT 
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "insert_by_caller" 
ON public.rtc_calls 
FOR INSERT 
WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "update_by_parties" 
ON public.rtc_calls 
FOR UPDATE 
USING (auth.uid() = caller_id OR auth.uid() = callee_id) 
WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Add status check constraint to ensure valid values
ALTER TABLE public.rtc_calls 
DROP CONSTRAINT IF EXISTS rtc_calls_status_check;

ALTER TABLE public.rtc_calls 
ADD CONSTRAINT rtc_calls_status_check 
CHECK (status IN ('ringing', 'active', 'completed', 'failed', 'rejected'));