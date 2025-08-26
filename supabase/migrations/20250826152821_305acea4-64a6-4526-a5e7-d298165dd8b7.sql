-- A) Fix Legal PDFs upload - Database setup only (no storage schema changes)

-- 0) Mark known phone as admin so uploads work after policy change
UPDATE public.profiles
SET is_admin = true
WHERE COALESCE(replace(replace(phone, '+',''), ' ', ''),'') IN ('919000666986','9000666986');

-- 1) ops_settings table + admin-only policies
CREATE TABLE IF NOT EXISTS public.ops_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.ops_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_admin_all ON public.ops_settings;
CREATE POLICY ops_admin_all
ON public.ops_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2) is_admin() – secure, stable, search_path=public (checks only profile flag)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_admin = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;