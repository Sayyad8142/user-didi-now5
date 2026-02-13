
-- 1) Add is_flat_locked column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_flat_locked boolean NOT NULL DEFAULT false;

-- 2) Trigger to auto-lock flat after first booking
CREATE OR REPLACE FUNCTION public.auto_lock_flat_on_first_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act on new bookings
  -- Check if user already has is_flat_locked = true (skip)
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND is_flat_locked = true) THEN
    RETURN NEW;
  END IF;

  -- Check if this is the first booking for this user
  IF NOT EXISTS (SELECT 1 FROM bookings WHERE user_id = NEW.user_id AND id != NEW.id LIMIT 1) THEN
    UPDATE profiles SET is_flat_locked = true WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_lock_flat ON public.bookings;
CREATE TRIGGER trg_auto_lock_flat
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_lock_flat_on_first_booking();

-- 3) Trigger to prevent flat field updates when locked
CREATE OR REPLACE FUNCTION public.prevent_locked_flat_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins to bypass
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- If flat is locked, prevent changes to flat fields
  IF OLD.is_flat_locked = true THEN
    IF NEW.flat_id IS DISTINCT FROM OLD.flat_id
       OR NEW.flat_no IS DISTINCT FROM OLD.flat_no
       OR NEW.community_id IS DISTINCT FROM OLD.community_id
       OR NEW.building_id IS DISTINCT FROM OLD.building_id THEN
      RAISE EXCEPTION 'Flat number is locked after first booking. Contact support to change it.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_flat_update ON public.profiles;
CREATE TRIGGER trg_prevent_locked_flat_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_flat_update();
