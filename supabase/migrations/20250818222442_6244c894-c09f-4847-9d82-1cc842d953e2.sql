-- Ensure helper exists
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- Secure version: assign_worker_to_booking (if your code calls this name)
CREATE OR REPLACE FUNCTION public.assign_worker_to_booking(p_booking_id uuid, p_worker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
  END IF;

  UPDATE public.bookings b
     SET worker_id   = p_worker_id,
         status      = 'assigned',
         assigned_at = COALESCE(b.assigned_at, now())
   WHERE b.id = p_booking_id;
END
$$;

-- Secure version: assign_worker (if your UI calls this shorter name)
CREATE OR REPLACE FUNCTION public.assign_worker(p_booking_id uuid, p_worker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
  END IF;

  UPDATE public.bookings b
     SET worker_id   = p_worker_id,
         status      = 'assigned',
         assigned_at = COALESCE(b.assigned_at, now())
   WHERE b.id = p_booking_id;
END
$$;