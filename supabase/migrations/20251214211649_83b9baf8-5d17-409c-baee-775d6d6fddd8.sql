-- Step 1: Delete duplicate profiles that were created with firebase_uid 
-- where original profile already exists (original = id matches the firebase_uid value)
DELETE FROM public.profiles 
WHERE id IN (
  SELECT p1.id 
  FROM public.profiles p1
  WHERE p1.firebase_uid IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.id::text = p1.firebase_uid 
      AND p2.id != p1.id
    )
);

-- Step 2: Now set firebase_uid = id for remaining profiles that don't have firebase_uid set
UPDATE public.profiles
SET firebase_uid = id::text
WHERE firebase_uid IS NULL;