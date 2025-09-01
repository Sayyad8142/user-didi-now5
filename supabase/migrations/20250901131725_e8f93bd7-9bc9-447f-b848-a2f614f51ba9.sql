-- Create demo user profile
INSERT INTO public.profiles (
  id,
  phone,
  full_name,
  community,
  flat_no,
  created_at,
  updated_at
) VALUES (
  'demo-user-uuid-12345',
  '+919876543210',
  'Demo User',
  'prestige high fields',
  '0000',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  phone = EXCLUDED.phone,
  full_name = EXCLUDED.full_name,
  community = EXCLUDED.community,
  flat_no = EXCLUDED.flat_no,
  updated_at = now();