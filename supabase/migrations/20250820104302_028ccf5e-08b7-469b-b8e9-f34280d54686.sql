-- Test the phone number check for admin access
-- Check if current user phone matches admin whitelist
DO $$
DECLARE
  current_phone text;
  admin_phone text;
  is_match boolean;
BEGIN
  -- Get current user's phone (if any)
  SELECT regexp_replace(COALESCE(u.phone,''), '\\D', '', 'g') INTO current_phone
  FROM auth.users u WHERE u.id = auth.uid();
  
  -- Get admin phone from settings
  SELECT regexp_replace(COALESCE(public.get_setting('admin_phone',''),''), '\\D', '', 'g') INTO admin_phone;
  
  -- Check if they match
  is_match := (current_phone = admin_phone AND current_phone != '');
  
  RAISE NOTICE 'Current user phone: %, Admin phone: %, Match: %', current_phone, admin_phone, is_match;
  RAISE NOTICE 'is_admin() result: %', public.is_admin();
END $$;