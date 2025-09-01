-- Create demo user profile with valid UUID
INSERT INTO public.profiles (
  id,
  phone,
  full_name,
  community,
  flat_no,
  created_at,
  updated_at
) VALUES (
  'dddddddd-eeee-4444-9999-111111111111'::uuid,
  '+919876543210',
  'Demo User',
  'prestige high fields',
  '0000',
  now(),
  now()
);