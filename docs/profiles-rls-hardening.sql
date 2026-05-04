-- profiles RLS hardening
--
-- Context: This app authenticates with Firebase. The Supabase JS client is
-- anonymous (no Supabase auth.uid()). All profile create/link/update flows
-- now go through the `bootstrap-profile` edge function using the service
-- role key, which bypasses RLS. Therefore, RLS on `public.profiles` can be
-- strict: deny anonymous writes, only allow self-reads/updates when there
-- is a real Supabase auth session (admin tooling, future migrations).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop overly permissive policies if they exist
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Authenticated users (Supabase auth) can view/update their own row only.
-- The `id` column here corresponds to the Supabase profile UUID, NOT
-- auth.uid(). If/when real Supabase auth sessions are introduced, link them
-- through a dedicated column. For now these are safety policies that block
-- public access while the service-role bootstrap function does all writes.
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_self_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "profiles_self_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Explicitly: NO policies for anon role. Service-role (used by
-- bootstrap-profile, wallet-read, etc.) bypasses RLS automatically.
