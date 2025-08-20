-- Remove stored public URLs (does NOT remove the ops_settings table)
DELETE FROM public.ops_settings WHERE key IN ('privacy_url','terms_url');

-- If the public bucket 'legal' exists, drop its contents and bucket
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='legal') THEN
    -- Delete all objects first
    DELETE FROM storage.objects WHERE bucket_id = 'legal';
    -- Remove the bucket
    DELETE FROM storage.buckets WHERE id = 'legal';
  END IF;
END $$;

-- Drop storage policies for 'legal' bucket if they exist (ignore errors)
DROP POLICY IF EXISTS legal_read ON storage.objects;
DROP POLICY IF EXISTS legal_insert ON storage.objects;
DROP POLICY IF EXISTS legal_update ON storage.objects;
DROP POLICY IF EXISTS legal_delete ON storage.objects;