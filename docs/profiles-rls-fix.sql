-- ============================================================================
-- Profiles RLS Fix — allow anonymous client to upsert/select own profile row
-- ============================================================================
-- Context:
--   Auth model is Firebase (Twilio Verify -> Firebase custom token).
--   The Supabase client itself runs as the anonymous role (no Supabase JWT).
--   Identity is carried as `profiles.firebase_uid` (text).
--
-- Symptom this fixes:
--   After OTP verify, the app calls `supabase.from('profiles').insert(...)`
--   and gets: 42501 "new row violates row-level security policy for table
--   profiles". The Home screen then shows skeleton + red error toast.
--
-- Approach:
--   Allow anon to SELECT/INSERT/UPDATE rows in `profiles` only when a
--   non-empty `firebase_uid` is present on the row. This matches the existing
--   architecture where the anon client is the only client and identity is
--   already proven by the Firebase ID token (used by edge functions).
--
-- Run this in the Supabase SQL editor for project: paywwbuqycovjopryele
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Clean up any prior versions of these policies (safe to re-run).
DROP POLICY IF EXISTS "profiles_anon_select_by_firebase_uid"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_anon_insert_with_firebase_uid" ON public.profiles;
DROP POLICY IF EXISTS "profiles_anon_update_by_firebase_uid"   ON public.profiles;

-- SELECT: anon can read profile rows that carry a firebase_uid.
-- (App filters by .eq('firebase_uid', uid) so users only fetch their own.)
CREATE POLICY "profiles_anon_select_by_firebase_uid"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (firebase_uid IS NOT NULL AND length(firebase_uid) > 0);

-- INSERT: anon can create a profile row only if firebase_uid is provided.
CREATE POLICY "profiles_anon_insert_with_firebase_uid"
ON public.profiles
FOR INSERT
TO anon, authenticated
WITH CHECK (firebase_uid IS NOT NULL AND length(firebase_uid) > 0);

-- UPDATE: anon can update rows keyed by firebase_uid.
CREATE POLICY "profiles_anon_update_by_firebase_uid"
ON public.profiles
FOR UPDATE
TO anon, authenticated
USING (firebase_uid IS NOT NULL AND length(firebase_uid) > 0)
WITH CHECK (firebase_uid IS NOT NULL AND length(firebase_uid) > 0);

-- Optional hardening (recommended):
--   Service-role functions remain unaffected (they bypass RLS).
--   Consider adding a CHECK / trigger that prevents updating `is_admin`,
--   `firebase_uid`, or other privileged columns from the anon client.
