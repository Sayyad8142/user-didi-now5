-- Create non-public bucket for legal PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-pdfs', 'legal-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: allow authenticated READ; admin-only write for bucket 'legal-pdfs'
DROP POLICY IF EXISTS legalpdf_read ON storage.objects;
CREATE POLICY legalpdf_read ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'legal-pdfs');

DROP POLICY IF EXISTS legalpdf_insert ON storage.objects;
CREATE POLICY legalpdf_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id='legal-pdfs' AND public.is_admin());

DROP POLICY IF EXISTS legalpdf_update ON storage.objects;
CREATE POLICY legalpdf_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id='legal-pdfs' AND public.is_admin())
WITH CHECK (bucket_id='legal-pdfs' AND public.is_admin());

DROP POLICY IF EXISTS legalpdf_delete ON storage.objects;
CREATE POLICY legalpdf_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id='legal-pdfs' AND public.is_admin());