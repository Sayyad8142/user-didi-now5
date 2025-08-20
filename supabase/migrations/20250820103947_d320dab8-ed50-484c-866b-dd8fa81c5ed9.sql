-- Align admin authorization with phone whitelist and fix worker upsert access
-- 1) Extend is_admin() to include phone whitelist from ops_settings
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS id
  ), prof AS (
    SELECT p.is_admin FROM public.profiles p JOIN me ON p.id = me.id
  ), my_phone AS (
    SELECT regexp_replace(COALESCE(u.phone,''), '\\D', '', 'g') AS phone
    FROM auth.users u
    WHERE u.id = auth.uid()
  ), wl_single AS (
    SELECT regexp_replace(COALESCE(public.get_setting('admin_phone',''),''), '\\D', '', 'g') AS phone
  ), wl_multi AS (
    SELECT COALESCE(string_to_array(public.get_setting('admin_whitelist',''), ','), ARRAY[]::text[]) AS arr
  )
  SELECT
    COALESCE((SELECT is_admin FROM prof), false)
    OR (
      COALESCE((SELECT phone FROM my_phone), '') <> ''
      AND (
        (SELECT phone FROM my_phone) = (SELECT phone FROM wl_single)
        OR EXISTS (
          SELECT 1
          FROM unnest((SELECT arr FROM wl_multi)) AS p
          WHERE regexp_replace(p, '\\D', '', 'g') = (SELECT phone FROM my_phone)
        )
      )
    );
$function$;

-- 2) Ensure the classic signature RPC also honors the same admin check (uses is_admin())
CREATE OR REPLACE FUNCTION public.admin_upsert_worker(
  p_full_name text,
  p_phone text,
  p_upi_id text,
  p_service_types text[],
  p_community text,
  p_photo_url text DEFAULT NULL::text,
  p_is_active boolean DEFAULT true
)
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
  p_upi_id    := NULLIF(trim(p_upi_id), '');
  p_community := NULLIF(trim(p_community), '');
  p_service_types := COALESCE(p_service_types, '{}'::text[]);

  IF p_full_name IS NULL OR p_phone IS NULL OR p_upi_id IS NULL THEN
    RAISE EXCEPTION 'full_name, phone, and upi_id are required';
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

-- 3) Keep JSONB signature; no change needed, but ensure it compiles and relies on is_admin()
CREATE OR REPLACE FUNCTION public.admin_upsert_worker(p_worker jsonb)
RETURNS workers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_worker public.workers;
  v_id uuid := NULLIF(p_worker->>'id','')::uuid;
  v_service_types text[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_worker->'service_types')), ARRAY[]::text[]);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied (admin only)' USING ERRCODE = '42501';
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
$function$;

-- 4) Seed a default admin_phone if not present (keeps parity with frontend default)
INSERT INTO public.ops_settings(key, value)
SELECT 'admin_phone', '+919000666986'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ops_settings WHERE key = 'admin_phone'
);
