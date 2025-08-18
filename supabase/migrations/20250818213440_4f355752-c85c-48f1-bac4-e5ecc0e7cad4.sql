-- Fix the workers table by adding missing columns
ALTER TABLE public.workers 
  ADD COLUMN IF NOT EXISTS upi_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Make upi_id required after adding it
UPDATE public.workers SET upi_id = phone WHERE upi_id = '';
ALTER TABLE public.workers ALTER COLUMN upi_id DROP DEFAULT;

-- Create trigger for updated_at if it doesn't exist
DROP TRIGGER IF EXISTS trg_workers_touch ON public.workers;
CREATE TRIGGER trg_workers_touch 
  BEFORE UPDATE ON public.workers
  FOR EACH ROW 
  EXECUTE FUNCTION public.touch_updated_at();

-- Fix storage policies for worker photos - make sure admins can upload
DROP POLICY IF EXISTS "Admins can upload worker photos" ON storage.objects;
CREATE POLICY "Admins can upload worker photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'worker-photos' 
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
    OR 
    -- Allow if user phone matches admin phone (fallback)
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND phone = '919000666986'
    )
  )
);

DROP POLICY IF EXISTS "Admins can update worker photos" ON storage.objects;
CREATE POLICY "Admins can update worker photos" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'worker-photos' 
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
    OR 
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND phone = '919000666986'
    )
  )
);