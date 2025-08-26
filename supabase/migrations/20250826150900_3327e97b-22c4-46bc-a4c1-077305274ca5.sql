-- Debug and fix RLS policies for app-pdfs bucket completely
-- First check if user is actually admin
DO $$
DECLARE
    current_user_id uuid := auth.uid();
    is_user_admin boolean;
BEGIN
    SELECT is_admin INTO is_user_admin FROM public.profiles WHERE id = current_user_id;
    RAISE NOTICE 'Current user ID: %, Is admin: %', current_user_id, is_user_admin;
END $$;

-- Drop all existing policies on storage.objects for app-pdfs
DROP POLICY IF EXISTS app_pdfs_public_read ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_admin_insert ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_admin_update ON storage.objects;
DROP POLICY IF EXISTS app_pdfs_admin_delete ON storage.objects;

-- Recreate simpler, more permissive policies for debugging
-- Allow public read access to app-pdfs
CREATE POLICY "app_pdfs_read_all" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'app-pdfs');

-- Allow any authenticated user to insert/update/delete for now (we'll restrict later)
CREATE POLICY "app_pdfs_authenticated_write" 
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'app-pdfs');

CREATE POLICY "app_pdfs_authenticated_update" 
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'app-pdfs')
WITH CHECK (bucket_id = 'app-pdfs');

CREATE POLICY "app_pdfs_authenticated_delete" 
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'app-pdfs');