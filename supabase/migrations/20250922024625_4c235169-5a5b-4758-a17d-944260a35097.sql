-- Update admin_upsert_worker function to make UPI ID optional
CREATE OR REPLACE FUNCTION public.admin_upsert_worker(p_full_name text, p_phone text, p_upi_id text, p_service_types text[], p_community text, p_photo_url text DEFAULT NULL::text, p_is_active boolean DEFAULT true)
 RETURNS workers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.workers;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied (admin only)' USING ERRCODE = '42501';
  END IF;

  -- Normalize inputs
  p_full_name := NULLIF(trim(p_full_name), '');
  p_phone     := NULLIF(regexp_replace(p_phone, '\\s+', '', 'g'), '');
  p_upi_id    := NULLIF(trim(p_upi_id), ''); -- Can be NULL now
  p_community := NULLIF(trim(p_community), '');
  p_service_types := COALESCE(p_service_types, '{}'::text[]);

  -- Only require full_name and phone, UPI ID is now optional
  IF p_full_name IS NULL OR p_phone IS NULL THEN
    RAISE EXCEPTION 'full_name and phone are required';
  END IF;

  -- Upsert by phone
  INSERT INTO public.workers (full_name, phone, upi_id, service_types, community, photo_url, is_active)
  VALUES (p_full_name, p_phone, p_upi_id, p_service_types, p_community, p_photo_url, COALESCE(p_is_active, true))
  ON CONFLICT (phone) DO UPDATE
    SET full_name     = EXCLUDED.full_name,
        upi_id        = EXCLUDED.upi_id,
        service_types = EXCLUDED.service_types,
        community     = EXCLUDED.community,
        photo_url     = EXCLUDED.photo_url,
        is_active     = EXCLUDED.is_active,
        updated_at    = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END
$function$;