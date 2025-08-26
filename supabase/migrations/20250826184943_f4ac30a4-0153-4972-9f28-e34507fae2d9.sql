-- Remove problematic policies first
DROP POLICY IF EXISTS "app_pdfs_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "app_pdfs_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "app_pdfs_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "app_pdfs_admin_delete" ON storage.objects;

-- Create new policies for app-pdfs bucket with simplified admin check
CREATE POLICY "Allow admins to manage app-pdfs"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'app-pdfs' 
    AND EXISTS (
      SELECT 1 FROM auth.users u 
      JOIN profiles p ON p.id = u.id 
      WHERE u.id = auth.uid() AND p.is_admin = true
    )
  )
  WITH CHECK (
    bucket_id = 'app-pdfs' 
    AND EXISTS (
      SELECT 1 FROM auth.users u 
      JOIN profiles p ON p.id = u.id 
      WHERE u.id = auth.uid() AND p.is_admin = true
    )
  );

-- Allow public read access to app-pdfs since it's a public bucket
CREATE POLICY "Public read access for app-pdfs"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'app-pdfs');