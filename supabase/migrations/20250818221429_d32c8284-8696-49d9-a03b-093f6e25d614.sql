-- 0) Safety: default false
ALTER TABLE public.profiles
  ALTER COLUMN is_admin SET DEFAULT false;

-- 1) Helper (idempotent): true if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT is_admin FROM public.profiles WHERE id = auth.uid()
  ), false)
$$;

-- 2) Trigger: block non-admin changes to is_admin (on update/insert)
CREATE OR REPLACE FUNCTION public.protect_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- block: any attempt to flip is_admin unless caller is already admin
  IF NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' AND COALESCE(NEW.is_admin, false) IS TRUE THEN
      RAISE EXCEPTION 'Access denied: cannot set is_admin on insert' USING ERRCODE='42501';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
      RAISE EXCEPTION 'Access denied: cannot change is_admin' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_protect_is_admin ON public.profiles;
CREATE TRIGGER trg_protect_is_admin
BEFORE INSERT OR UPDATE OF is_admin ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_is_admin();