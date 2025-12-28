-- Fix user_fcm_tokens schema to support Firebase auth mapping and correct FK

-- 1) Drop incorrect FK to auth.users (app uses profiles.id)
ALTER TABLE public.user_fcm_tokens
  DROP CONSTRAINT IF EXISTS user_fcm_tokens_user_id_fkey;

-- 2) Ensure FK points to public.profiles(id)
ALTER TABLE public.user_fcm_tokens
  ADD CONSTRAINT user_fcm_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 3) Convert device_info from text -> jsonb (safe for NULL/empty; existing values must be valid JSON)
ALTER TABLE public.user_fcm_tokens
  ALTER COLUMN device_info TYPE jsonb
  USING (
    CASE
      WHEN device_info IS NULL OR btrim(device_info) = '' THEN NULL
      ELSE device_info::jsonb
    END
  );

-- 4) Tighten RLS: users can manage only their own tokens (based on get_profile_id())
DROP POLICY IF EXISTS "Users can manage own tokens" ON public.user_fcm_tokens;
CREATE POLICY "Users can manage own tokens"
ON public.user_fcm_tokens
FOR ALL
TO public
USING (user_id = get_profile_id())
WITH CHECK (user_id = get_profile_id());

-- 5) Tighten RLS: service_role-only read-all (prevents public token leakage)
DROP POLICY IF EXISTS "Service role can read all tokens" ON public.user_fcm_tokens;
CREATE POLICY "Service role can read all tokens"
ON public.user_fcm_tokens
FOR SELECT
TO service_role
USING (true);
