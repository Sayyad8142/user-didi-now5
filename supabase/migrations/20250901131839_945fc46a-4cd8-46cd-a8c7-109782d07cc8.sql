-- Create demo user profile with proper UUID
INSERT INTO public.profiles (
  id,
  phone,
  full_name,
  community,
  flat_no,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '+919876543210',
  'Demo User',
  'prestige high fields',
  '0000',
  now(),
  now()
) ON CONFLICT (phone) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  community = EXCLUDED.community,
  flat_no = EXCLUDED.flat_no,
  updated_at = now();