-- A) Store a private cron secret (used by any external runner)
CREATE TABLE IF NOT EXISTS public.ops_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE public.ops_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_admin_all ON public.ops_settings;
CREATE POLICY ops_admin_all ON public.ops_settings
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Upsert your secret once (change to any long random string if you want)
INSERT INTO public.ops_settings(key,value)
VALUES ('cron_secret','CHANGE_ME_TO_A_LONG_RANDOM_STRING')
ON CONFLICT (key) DO NOTHING;

-- B) Core SLA work (idempotent): call whatever maintenance you use
-- If you already have these, this wrapper will just call them.
CREATE OR REPLACE FUNCTION public._sla_core_work()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- run your existing jobs; ignore if some do not exist
  BEGIN PERFORM public.auto_complete_assigned(); EXCEPTION WHEN undefined_function THEN null; END;
  BEGIN PERFORM public.escalate_overdue_bookings(); EXCEPTION WHEN undefined_function THEN null; END;
  BEGIN PERFORM public.run_scheduled_prealerts(); EXCEPTION WHEN undefined_function THEN null; END;
END
$$;

-- C) Gatekeeper RPC: require the shared secret to run core SLA
CREATE OR REPLACE FUNCTION public.run_sla_with_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s text;
BEGIN
  SELECT value INTO s FROM public.ops_settings WHERE key='cron_secret';
  IF p_secret IS NULL OR s IS NULL OR p_secret <> s THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;
  PERFORM public._sla_core_work();
END
$$;

-- Optional: if you had an older public function, make it no-op for non-admins
-- (keeps compatibility if something calls it by mistake)
CREATE OR REPLACE FUNCTION public.auto_handle_overdue_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;
  PERFORM public._sla_core_work();
  RETURN 0; -- Return integer to match original signature
END
$$;