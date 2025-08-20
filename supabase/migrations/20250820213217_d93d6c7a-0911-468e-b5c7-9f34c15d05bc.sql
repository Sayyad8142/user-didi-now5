-- Storage policies to fix admin worker photo uploads
-- Allow public read for worker-photos (so avatars load without auth)
CREATE POLICY IF NOT EXISTS "Public read worker-photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'worker-photos');

-- Allow admins to upload new photos to worker-photos
CREATE POLICY IF NOT EXISTS "Admins can upload worker-photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'worker-photos' AND public.is_admin()
);

-- Allow admins to update/replace photos in worker-photos
CREATE POLICY IF NOT EXISTS "Admins can update worker-photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'worker-photos' AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'worker-photos' AND public.is_admin()
);

-- Allow admins to delete photos in worker-photos
CREATE POLICY IF NOT EXISTS "Admins can delete worker-photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'worker-photos' AND public.is_admin()
);