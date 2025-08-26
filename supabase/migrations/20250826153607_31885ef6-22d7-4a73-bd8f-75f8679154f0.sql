-- Legal PDFs - create bucket and RLS policies for app-pdfs

-- 0) Ensure the current admin is actually admin
UPDATE public.profiles
SET is_admin = true
WHERE COALESCE(replace(replace(phone, '+',''), ' ', ''),'') IN ('919000666986','9000666986');

-- 1) Create the bucket if it does not exist, make it public
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('app-pdfs','app-pdfs', true, 8388608)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;

-- 2) RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop any old policies we created earlier
DROP POLICY IF EXISTS app_pdfs_public_read  ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_admin_insert ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_admin_update ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_admin_delete ON storage.objects;

-- 3) Public READ for that bucket
CREATE POLICY app_pdfs_public_read
ON storage.objects
FOR SELECT
USING (bucket_id = 'app-pdfs');

-- 4) Admin-only INSERT/UPDATE/DELETE for that bucket
CREATE POLICY app_pdfs_admin_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin());

CREATE POLICY app_pdfs_admin_update
ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'app-pdfs' AND public.is_admin())
WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin());

CREATE POLICY app_pdfs_admin_delete
ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'app-pdfs' AND public.is_admin());

-- (Optional but helpful) Ensure roles can use the storage schema
GRANT USAGE ON SCHEMA storage TO authenticated;