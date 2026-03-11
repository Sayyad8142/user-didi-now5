
-- Postgres-native cleanup function (no HTTP calls, no tokens)
CREATE OR REPLACE FUNCTION public.cleanup_payment_intents()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.payment_intents
  WHERE status IN ('pending', 'cancelled', 'failed')
    AND created_at < (now() - interval '24 hours');
$$;

-- Schedule daily at 3 AM UTC
SELECT cron.schedule(
  'cleanup-payment-intents',
  '0 3 * * *',
  'SELECT public.cleanup_payment_intents();'
);
