-- Add unique index for user_id + token combination to support multiple devices per user
CREATE UNIQUE INDEX IF NOT EXISTS fcm_tokens_user_token_uidx ON public.fcm_tokens(user_id, token);

-- Enable RLS on fcm_tokens if not already enabled
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to recreate them
DROP POLICY IF EXISTS "Users can view their own tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "Users can insert their own tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "Users can update their own tokens" ON public.fcm_tokens;
DROP POLICY IF EXISTS "Users can delete their own tokens" ON public.fcm_tokens;

-- Create RLS policies for fcm_tokens
-- Users can only see their own tokens
CREATE POLICY "Users can view their own tokens" 
ON public.fcm_tokens 
FOR SELECT 
USING (auth.uid()::text = user_id::text);

-- Users can insert their own tokens
CREATE POLICY "Users can insert their own tokens" 
ON public.fcm_tokens 
FOR INSERT 
WITH CHECK (auth.uid()::text = user_id::text);

-- Users can update their own tokens
CREATE POLICY "Users can update their own tokens" 
ON public.fcm_tokens 
FOR UPDATE 
USING (auth.uid()::text = user_id::text);

-- Users can delete their own tokens
CREATE POLICY "Users can delete their own tokens" 
ON public.fcm_tokens 
FOR DELETE 
USING (auth.uid()::text = user_id::text);

-- Also allow service role to manage all tokens (for edge functions)
DROP POLICY IF EXISTS "Service role can manage all tokens" ON public.fcm_tokens;
CREATE POLICY "Service role can manage all tokens"
ON public.fcm_tokens
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');