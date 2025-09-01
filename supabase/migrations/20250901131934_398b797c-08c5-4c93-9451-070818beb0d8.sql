-- Create demo user profile 
-- First check if demo user already exists and delete if so
DELETE FROM public.profiles WHERE phone = '+919876543210';

-- Insert demo user profile
INSERT INTO public.profiles (
  id,
  phone,
  full_name,
  community,
  flat_no,
  created_at,
  updated_at
) VALUES (
  'dddddddd-eeee-mmmm-oooo-111111111111'::uuid,
  '+919876543210',
  'Demo User',
  'prestige high fields',
  '0000',
  now(),
  now()
);