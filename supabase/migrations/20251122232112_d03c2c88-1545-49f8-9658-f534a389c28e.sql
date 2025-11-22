-- Fix scheduled booking assignment logic
-- Workers should only be notified 15 minutes before scheduled time, not immediately

-- 1. Update the Pushcut notification trigger to ONLY fire for INSTANT bookings
CREATE OR REPLACE FUNCTION public.notify_pushcut_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url  text := (SELECT value FROM public.ops_settings WHERE key='pushcut_booking_url');
  v_open text := (SELECT value FROM public.ops_settings WHERE key='admin_open_url');
  v_payload jsonb;
  v_resp  http_response;
BEGIN
  -- No webhook configured → skip
  IF v_url IS NULL OR v_url = '' THEN
    RETURN NEW;
  END IF;

  -- Only alert on brand-new pending bookings
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- CRITICAL FIX: Only notify for INSTANT bookings
  -- Scheduled bookings will be handled by run_scheduled_prealerts() 15 minutes before scheduled time
  IF NEW.booking_type = 'scheduled' THEN
    RETURN NEW;
  END IF;

  -- Build payload WITHOUT a "sound" key so Pushcut uses its own configured sound
  v_payload := jsonb_build_object(
    'title', 'New Booking — ' || COALESCE(initcap(NEW.service_type),'Service'),
    'text',  COALESCE(NEW.community,'') || ' ' || COALESCE(NEW.flat_no,'') ||
             ' • ' || COALESCE(NEW.cust_name,'') || ' (' || COALESCE(NEW.cust_phone,'') || ')'
  );

  IF v_open IS NOT NULL AND v_open <> '' THEN
    v_payload := v_payload || jsonb_build_object('url', v_open || '?b=' || NEW.id);
  END IF;

  v_resp := http_post(v_url, v_payload::text, 'application/json');
  RETURN NEW;
END
$$;

-- 2. Update the scheduled prealerts function to run more frequently (every minute)
-- Update cron job to run every minute instead of every 5 minutes
SELECT cron.unschedule('didinow_prealerts_every_5min');
SELECT cron.schedule(
  'didinow_prealerts_every_minute',
  '* * * * *',  -- Every minute
  $$SELECT public.run_scheduled_prealerts(15);$$
);