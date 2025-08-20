-- Settings for cancellation windows (minutes)
INSERT INTO public.ops_settings(key,value) VALUES
  ('cancel_window_instant_minutes','2'),
  ('cancel_window_sched_before_minutes','15')
ON CONFLICT (key) DO NOTHING;

-- Add cancellation fields on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS can_cancel_until timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancel_source text CHECK (cancel_source IN ('user','admin'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS bookings_can_cancel_until_idx ON public.bookings(can_cancel_until);
CREATE INDEX IF NOT EXISTS bookings_cancelled_at_idx ON public.bookings(cancelled_at);

-- Helper function to get integer settings
CREATE OR REPLACE FUNCTION public._get_int_setting(k text, default_val int)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value::int FROM public.ops_settings WHERE key=k LIMIT 1), default_val);
$$;

-- Function to recompute cancellation window
CREATE OR REPLACE FUNCTION public._recompute_can_cancel_until()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inst_min  int := public._get_int_setting('cancel_window_instant_minutes', 2);
  sched_min int := public._get_int_setting('cancel_window_sched_before_minutes', 15);
  scheduled_ts timestamptz;
BEGIN
  -- Determine scheduled timestamp if any
  IF NEW.booking_type = 'scheduled' AND NEW.scheduled_date IS NOT NULL AND NEW.scheduled_time IS NOT NULL THEN
    scheduled_ts := (NEW.scheduled_date::date + NEW.scheduled_time);
    NEW.can_cancel_until := scheduled_ts - make_interval(mins := sched_min);
  ELSE
    -- instant booking: X minutes from creation
    IF TG_OP = 'INSERT' THEN
      NEW.can_cancel_until := COALESCE(NEW.created_at, now()) + make_interval(mins := inst_min);
    ELSE
      -- keep previous unless null
      NEW.can_cancel_until := COALESCE(NEW.can_cancel_until, now() + make_interval(mins := inst_min));
    END IF;
  END IF;

  -- never allow can_cancel_until in the past at create-time; clamp to now() if computed earlier
  IF TG_OP = 'INSERT' AND NEW.can_cancel_until < now() THEN
    NEW.can_cancel_until := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for cancellation window computation
DROP TRIGGER IF EXISTS trg_bookings_can_cancel ON public.bookings;
CREATE TRIGGER trg_bookings_can_cancel
BEFORE INSERT OR UPDATE OF booking_type, scheduled_date, scheduled_time, created_at
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public._recompute_can_cancel_until();

-- USER cancellation function
CREATE OR REPLACE FUNCTION public.user_cancel_booking(p_booking_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;

  IF b.id IS NULL THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  IF b.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF b.cancelled_at IS NOT NULL OR b.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'already_finished';
  END IF;

  IF b.can_cancel_until IS NULL OR now() > b.can_cancel_until THEN
    RAISE EXCEPTION 'cancel_window_expired';
  END IF;

  UPDATE public.bookings
  SET status='cancelled',
      cancelled_at=now(),
      cancel_reason=COALESCE(p_reason,''),
      cancel_source='user',
      updated_at=now()
  WHERE id = p_booking_id;
END;
$$;

-- ADMIN cancellation function
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(p_booking_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  IF b.cancelled_at IS NOT NULL OR b.status='cancelled' THEN
    RETURN;
  END IF;

  UPDATE public.bookings
  SET status='cancelled',
      cancelled_at=now(),
      cancel_reason=COALESCE(p_reason,''),
      cancel_source='admin',
      updated_at=now()
  WHERE id=p_booking_id;
END;
$$;