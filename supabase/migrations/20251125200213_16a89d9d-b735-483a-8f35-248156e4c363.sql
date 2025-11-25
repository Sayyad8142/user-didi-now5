-- Fix: Scheduled booking notifications - Only INSTANT bookings trigger immediate alerts

-- 1. PUSHCUT TRIGGER
CREATE OR REPLACE FUNCTION public.notify_pushcut_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url  text;
  v_open text;
  v_payload jsonb;
  v_resp  http_response;
BEGIN
  SELECT value INTO v_url FROM public.ops_settings WHERE key='pushcut_booking_url';
  SELECT value INTO v_open FROM public.ops_settings WHERE key='admin_open_url';

  IF v_url IS NULL OR v_url = '' OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- CRITICAL: Skip scheduled bookings
  IF NEW.booking_type = 'scheduled' THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'title', 'New Booking — ' || COALESCE(initcap(NEW.service_type),'Service'),
    'text',  COALESCE(NEW.community,'') || ' ' || COALESCE(NEW.flat_no,'') || ' • ' || COALESCE(NEW.cust_name,'')
  );

  IF v_open IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('url', v_open || '?b=' || NEW.id);
  END IF;

  v_resp := http_post(v_url, v_payload::text, 'application/json');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_notify_pushcut_new_booking ON public.bookings;
CREATE TRIGGER trg_notify_pushcut_new_booking AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_pushcut_new_booking();

-- 2. TELEGRAM TRIGGER
CREATE OR REPLACE FUNCTION public.notify_telegram_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/new-booking-telegram';
  v_resp http_response;
BEGIN
  IF NEW.status <> 'pending' OR NEW.booking_type = 'scheduled' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_resp := http_post(v_url, jsonb_build_object('type','INSERT','table','bookings','record',row_to_json(NEW))::text, 'application/json');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_telegram_new_booking ON public.bookings;
CREATE TRIGGER trigger_telegram_new_booking AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_telegram_new_booking();

-- 3. Cron job (if not exists)
DO $$
BEGIN
  PERFORM cron.schedule('didinow_prealerts_every_minute', '* * * * *', 'SELECT public.run_scheduled_prealerts(15);');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;