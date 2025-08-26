-- Fix RLS policies for app-pdfs bucket
-- First, drop existing policies that might be conflicting
DROP POLICY IF EXISTS legal_pdfs_public_read ON storage.objects;
DROP POLICY IF EXISTS legal_pdfs_admin_insert ON storage.objects;
DROP POLICY IF EXISTS legal_pdfs_admin_update ON storage.objects;
DROP POLICY IF EXISTS legal_pdfs_admin_delete ON storage.objects;

-- Ensure the is_admin function has proper grants
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- Create working RLS policies for app-pdfs bucket
CREATE POLICY "app_pdfs_public_read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'app-pdfs');

CREATE POLICY "app_pdfs_admin_insert" 
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin());

CREATE POLICY "app_pdfs_admin_update" 
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'app-pdfs' AND public.is_admin())
WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin());

CREATE POLICY "app_pdfs_admin_delete" 
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'app-pdfs' AND public.is_admin());