-- Drop the protect_is_admin function (this will cascade and remove the trigger)
DROP FUNCTION IF EXISTS public.protect_is_admin() CASCADE;

-- Update the two admin users
UPDATE public.profiles SET is_admin = true WHERE id = '0ba548d0-c055-40f1-87d7-dd1b21d51910';
UPDATE public.profiles SET is_admin = true WHERE id = 'c6b8fb7a-7176-4e7a-a3a7-cad7e536bc62';

-- Recreate the protect function and trigger
CREATE OR REPLACE FUNCTION public.protect_is_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
END;
$$;

CREATE TRIGGER protect_is_admin_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_is_admin();