-- 1) Status history table
CREATE TABLE IF NOT EXISTS public.booking_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT,
  changed_by UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Trigger to auto-log status transitions
CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history
      (booking_id, from_status, to_status, changed_by, note)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), NULL);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_booking ON public.bookings;
CREATE TRIGGER trg_log_booking
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.log_booking_status_change();

-- 3) RLS: allow admins all; users can read history of their own bookings
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bsh_admin_all ON public.booking_status_history;
CREATE POLICY bsh_admin_all ON public.booking_status_history
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS bsh_user_select_own ON public.booking_status_history;
CREATE POLICY bsh_user_select_own ON public.booking_status_history
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_status_history.booking_id
      AND b.user_id = auth.uid()
  )
);

-- Optional index for performance
CREATE INDEX IF NOT EXISTS idx_bsh_booking_created
  ON public.booking_status_history(booking_id, created_at DESC);