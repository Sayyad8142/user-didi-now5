-- Drop the foreign key constraint on profiles.id that references auth.users
-- This is required because the app uses Firebase Auth, not Supabase Auth
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;