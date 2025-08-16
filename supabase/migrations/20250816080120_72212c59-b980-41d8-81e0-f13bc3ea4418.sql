-- Ensure RLS is enabled on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles if they don't exist
CREATE POLICY IF NOT EXISTS "profiles_self_select" ON public.profiles 
FOR SELECT USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "profiles_self_insert" ON public.profiles 
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "profiles_self_update" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);