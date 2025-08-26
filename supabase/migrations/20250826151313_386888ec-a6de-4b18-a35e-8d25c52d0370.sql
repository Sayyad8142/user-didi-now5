-- Strengthen admin detection and restore secure storage policies
-- 1) Update is_admin() to also allow phone whitelist (ops_settings.admin_phone or default)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  ) OR (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.norm_phone(p.phone) = public.norm_phone(
          COALESCE((SELECT value FROM public.ops_settings WHERE key='admin_phone' LIMIT 1), '919000666986')
        )
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 2) Ensure admin_phone setting exists (idempotent)
INSERT INTO public.ops_settings(key,value)
VALUES ('admin_phone','919000666986')
ON CONFLICT (key) DO NOTHING;

-- 3) Restore secure storage policies: admin-only write on app-pdfs, public read
DROP POLICY IF EXISTS app_pdfs_authenticated_write ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_authenticated_delete ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_read_all ON storage.objects;

-- public read
CREATE POLICY legal_pdfs_public_read
ON storage.objects FOR SELECT
USING (bucket_id = 'app-pdfs');

-- admin-only write
CREATE POLICY legal_pdfs_admin_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin());

CREATE POLICY legal_pdfs_admin_update
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'app-pdfs' AND public.is_admin())
WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin());

CREATE POLICY legal_pdfs_admin_delete
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'app-pdfs' AND public.is_admin());