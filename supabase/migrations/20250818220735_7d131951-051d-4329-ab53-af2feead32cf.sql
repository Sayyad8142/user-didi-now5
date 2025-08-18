-- Replace admin_upsert_worker to check admin inline without relying on is_admin()
CREATE OR REPLACE FUNCTION public.admin_upsert_worker(p_worker jsonb)
RETURNS public.workers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker public.workers;
  v_id uuid := NULLIF(p_worker->>'id','')::uuid;
  v_service_types text[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_worker->'service_types')), ARRAY[]::text[]);
  v_is_admin boolean := false;
BEGIN
  -- Determine admin status directly from profiles (RLS bypassed because SECURITY DEFINER)
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false)
  INTO v_is_admin;

  -- Optional fallback by phone if needed (helps when profile not yet seeded)
  IF NOT v_is_admin THEN
    SELECT COALESCE((SELECT phone = '919000666986' FROM auth.users WHERE id = auth.uid()), false)
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.workers AS w (
    id, full_name, phone, upi_id, community, is_active, service_types, photo_url
  ) VALUES (
    COALESCE(v_id, gen_random_uuid()),
    p_worker->>'full_name',
    p_worker->>'phone',
    p_worker->>'upi_id',
    NULLIF(p_worker->>'community',''),
    COALESCE((p_worker->>'is_active')::boolean, true),
    v_service_types,
    NULLIF(p_worker->>'photo_url','')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    upi_id = EXCLUDED.upi_id,
    community = EXCLUDED.community,
    is_active = EXCLUDED.is_active,
    service_types = EXCLUDED.service_types,
    photo_url = EXCLUDED.photo_url,
    updated_at = now()
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_worker(jsonb) TO authenticated;