-- 0) Ensure is_admin is callable in policies without altering existing behavior
DO $$
BEGIN
  -- Grant execute on the existing public.is_admin() function to the authenticated role
  BEGIN
    GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
  EXCEPTION WHEN undefined_function THEN
    -- If the function does not exist for some reason, create a compatible version
    CREATE OR REPLACE FUNCTION public.is_admin()
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      u_phone text := '';
      u_norm  text := '';
      wl      text := coalesce((select value from public.ops_settings where key='admin_phones'),'');
      wl_arr  text[];
    BEGIN
      IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true) THEN
        RETURN true;
      END IF;

      SELECT coalesce(p.phone, u.phone) INTO u_phone
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id = auth.uid();

      u_norm := public.norm_phone(u_phone);
      wl_arr := string_to_array(replace(wl,' ','') , ',');

      IF u_norm <> '' AND wl_arr IS NOT NULL AND u_norm = ANY (wl_arr) THEN
        RETURN true;
      END IF;

      RETURN false;
    END;
    $fn$;
    GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
  END;
END $$;

-- 1) Ensure buckets exist and are public
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-pdfs','app-pdfs', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-pdfs','legal-pdfs', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 2) Policies – public read, admin writes for both buckets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='public_read_legal_pdfs'
  ) THEN
    CREATE POLICY public_read_legal_pdfs
    ON storage.objects FOR SELECT
    USING (bucket_id IN ('app-pdfs','legal-pdfs'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='admin_insert_legal_pdfs'
  ) THEN
    CREATE POLICY admin_insert_legal_pdfs
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id IN ('app-pdfs','legal-pdfs') AND public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='admin_update_legal_pdfs'
  ) THEN
    CREATE POLICY admin_update_legal_pdfs
    ON storage.objects FOR UPDATE
    USING (bucket_id IN ('app-pdfs','legal-pdfs') AND public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='admin_delete_legal_pdfs'
  ) THEN
    CREATE POLICY admin_delete_legal_pdfs
    ON storage.objects FOR DELETE
    USING (bucket_id IN ('app-pdfs','legal-pdfs') AND public.is_admin());
  END IF;
END $$;