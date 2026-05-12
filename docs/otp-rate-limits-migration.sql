-- Run this on the EXTERNAL Supabase project (paywwbuqycovjopryele)
-- where `profiles` lives. The `twilio-send-otp` edge function calls it via service role.

CREATE TABLE IF NOT EXISTS public.otp_rate_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_phone_created
  ON public.otp_rate_limits (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_otp_rate_limits_ip_created
  ON public.otp_rate_limits (ip, created_at DESC);

ALTER TABLE public.otp_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on otp_rate_limits" ON public.otp_rate_limits;
CREATE POLICY "Service role full access on otp_rate_limits"
  ON public.otp_rate_limits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Optional: nightly cleanup of rows older than 24h (run via cron)
-- DELETE FROM public.otp_rate_limits WHERE created_at < now() - interval '24 hours';
