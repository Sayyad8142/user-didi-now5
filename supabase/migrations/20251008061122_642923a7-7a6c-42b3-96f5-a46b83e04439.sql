-- Create admin email user if not exists
-- Note: This inserts into auth.users which requires proper hashing
-- For security, this should be done through Supabase Auth API or dashboard

-- First, let's check if we can insert via a function
-- Create a function to safely create admin user
CREATE OR REPLACE FUNCTION create_admin_email_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE email = 'team@didisnow.com';
  
  IF v_user_id IS NULL THEN
    -- Insert into auth.users (this won't work due to RLS, needs to be done via dashboard)
    RAISE NOTICE 'User does not exist. Please create user team@didisnow.com via Supabase Auth dashboard';
  ELSE
    -- User exists, ensure they have a profile with admin flag
    INSERT INTO public.profiles (id, full_name, phone, community, flat_no, is_admin)
    VALUES (v_user_id, 'Admin Team', '', 'other', '', true)
    ON CONFLICT (id) DO UPDATE 
    SET is_admin = true;
  END IF;
END;
$$;