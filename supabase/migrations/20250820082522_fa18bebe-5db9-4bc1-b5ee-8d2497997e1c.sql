-- Create a public bucket "legal" if missing
INSERT INTO storage.buckets (id, name, public) 
SELECT 'legal', 'legal', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'legal');

-- Storage RLS on storage.objects: public read, admin-only write for bucket 'legal'
-- Allow everyone to READ objects from 'legal'
DROP POLICY IF EXISTS legal_read ON storage.objects;
CREATE POLICY legal_read ON storage.objects
FOR SELECT
USING (bucket_id = 'legal');

-- Allow only authenticated admins to INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS legal_insert ON storage.objects;
CREATE POLICY legal_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id='legal' AND public.is_admin());

DROP POLICY IF EXISTS legal_update ON storage.objects;
CREATE POLICY legal_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id='legal' AND public.is_admin())
WITH CHECK (bucket_id='legal' AND public.is_admin());

DROP POLICY IF EXISTS legal_delete ON storage.objects;
CREATE POLICY legal_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id='legal' AND public.is_admin());