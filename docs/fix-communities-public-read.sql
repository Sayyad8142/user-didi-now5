-- Root cause: public reads on communities fail with
--   ERROR 42501: permission denied for function is_admin
-- An RLS policy on public.communities calls is_admin(), but anon/authenticated
-- lack EXECUTE on it, so every client SELECT is rejected (empty community list).
--
-- Run this on the external DB (api.didisnow.com) to restore direct reads.

-- 1) Allow the API roles to execute the helper used by the policies
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- 2) Make sure a simple public read policy exists (no function call needed)
DROP POLICY IF EXISTS "communities_public_read" ON public.communities;
CREATE POLICY "communities_public_read"
ON public.communities
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- 3) Grants required by the Data API
GRANT SELECT ON public.communities TO anon, authenticated;
GRANT ALL ON public.communities TO service_role;
