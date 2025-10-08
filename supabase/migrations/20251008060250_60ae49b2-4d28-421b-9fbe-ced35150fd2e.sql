-- Fix is_admin() to check auth.users phone if profile doesn't exist
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone text;
  v_csv text;
  v_norm text;
  v_match boolean := false;
  v_auth_phone text;
BEGIN
  -- Primary: explicit profile flag
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true) THEN
    RETURN true;
  END IF;

  -- Get phone from profile first
  SELECT phone INTO v_phone FROM public.profiles WHERE id = auth.uid();
  
  -- If no profile or no phone in profile, check auth.users
  IF v_phone IS NULL THEN
    SELECT 
      COALESCE(
        phone,
        (raw_user_meta_data->>'phone')::text,
        (raw_user_meta_data->>'phone_number')::text
      ) INTO v_auth_phone
    FROM auth.users 
    WHERE id = auth.uid();
    
    v_phone := v_auth_phone;
  END IF;
  
  -- Get CSV from settings
  SELECT value INTO v_csv FROM public.ops_settings WHERE key = 'admin_phones';

  IF v_phone IS NULL OR v_csv IS NULL OR LENGTH(TRIM(v_csv)) = 0 THEN
    RETURN false;
  END IF;

  v_norm := public.norm_phone(v_phone);

  -- Check if any entry matches after normalization
  SELECT true INTO v_match
  FROM (
    SELECT public.norm_phone(TRIM(x)) AS p FROM regexp_split_to_table(v_csv, '\s*,\s*') AS x
  ) s
  WHERE s.p IS NOT NULL AND s.p <> '' AND s.p = v_norm
  LIMIT 1;

  RETURN COALESCE(v_match, false);
END;
$$;