-- Ensure RLS is enabled on profiles table (already exists from previous migrations)
-- This is safe to run multiple times
DO $$ 
BEGIN
    -- Enable RLS if not already enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c 
        JOIN pg_namespace n ON n.oid = c.relnamespace 
        WHERE n.nspname = 'public' AND c.relname = 'profiles' AND c.relrowsecurity = true
    ) THEN
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;  
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;

-- Create the RLS policies
CREATE POLICY "profiles_self_select" ON public.profiles 
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_self_insert" ON public.profiles 
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_self_update" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);