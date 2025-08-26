-- Ensure app-pdfs bucket is public
update storage.buckets set public = true where id = 'app-pdfs';

-- Create admin policies for app-pdfs bucket if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'app_pdfs_admin_insert'
  ) THEN
    EXECUTE $$CREATE POLICY "app_pdfs_admin_insert" ON storage.objects
      FOR INSERT TO authenticated
      USING (bucket_id = 'app-pdfs' AND public.is_admin())
      WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin())$$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'app_pdfs_admin_update'
  ) THEN
    EXECUTE $$CREATE POLICY "app_pdfs_admin_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'app-pdfs' AND public.is_admin())
      WITH CHECK (bucket_id = 'app-pdfs' AND public.is_admin())$$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'app_pdfs_admin_delete'
  ) THEN
    EXECUTE $$CREATE POLICY "app_pdfs_admin_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'app-pdfs' AND public.is_admin())$$;
  END IF;
END
$$;