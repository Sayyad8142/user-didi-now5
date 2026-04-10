-- =============================================================
-- Trigger: Notify user via push when wallet credit is received
-- Runs on INSERT into wallet_transactions where type = 'credit'
-- Uses pg_net to call the notify-wallet-credit edge function
-- =============================================================

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.notify_wallet_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text;
  _service_key  text;
BEGIN
  -- Only fire for credits
  IF NEW.type <> 'credit' THEN
    RETURN NEW;
  END IF;

  -- Get the edge function URL (same Supabase project)
  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_key  := current_setting('app.settings.service_role_key', true);

  -- If settings not available, try env-based approach
  IF _supabase_url IS NULL THEN
    -- Fallback: hardcode your production Supabase URL here
    -- _supabase_url := 'https://paywwbuqycovjopryele.supabase.co';
    -- _service_key  := '<your-service-role-key>';
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP POST via pg_net
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/notify-wallet-credit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id::text,
      'amount', COALESCE(NEW.amount_inr, NEW.amount, 0),
      'reason', COALESCE(NEW.reason, NEW.notes, NEW.description, ''),
      'source', COALESCE(NEW.reference_type, NEW.source, 'system')
    )
  );

  RETURN NEW;
END;
$$;

-- 2. Create the trigger (fires AFTER INSERT so the credit is committed)
DROP TRIGGER IF EXISTS trg_notify_wallet_credit ON public.wallet_transactions;

CREATE TRIGGER trg_notify_wallet_credit
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW
  WHEN (NEW.type = 'credit')
  EXECUTE FUNCTION public.notify_wallet_credit();

-- NOTE: This requires the pg_net extension to be enabled:
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- You also need to set the app settings or hardcode the URL:
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
