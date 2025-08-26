-- A) Ensure admin, ops_settings, is_admin(), and storage RLS for app-pdfs

-- 0) Mark known phone as admin so uploads work after policy change
UPDATE public.profiles
SET is_admin = true
WHERE COALESCE(replace(replace(phone, '+',''), ' ', ''),'') IN ('919000666986','9000666986');

-- 1) ops_settings table + admin-only policies
CREATE TABLE IF NOT EXISTS public.ops_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.ops_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_admin_all ON public.ops_settings;
CREATE POLICY ops_admin_all
ON public.ops_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2) is_admin() – secure, stable, search_path=public (checks only profile flag)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_admin = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 3) STORAGE RLS for bucket = 'app-pdfs'
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Public read (needed for stores)
DROP POLICY IF EXISTS app_pdfs_public_read ON storage.objects;
CREATE POLICY app_pdfs_public_read
ON storage.objects
FOR SELECT
USING (bucket_id = 'app-pdfs');

-- Admin insert
DROP POLICY IF EXISTS app_pdfs_admin_insert ON storage.objects;
CREATE POLICY app_pdfs_admin_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin());

-- Admin update
DROP POLICY IF EXISTS app_pdfs_admin_update ON storage.objects;
CREATE POLICY app_pdfs_admin_update
ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'app-pdfs' AND public.is_admin())
WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin());

-- Admin delete
DROP POLICY IF EXISTS app_pdfs_admin_delete ON storage.objects;
CREATE POLICY app_pdfs_admin_delete
ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'app-pdfs' AND public.is_admin());