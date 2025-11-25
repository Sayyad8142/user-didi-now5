-- Fix scheduled booking notifications: prevent instant alerts for scheduled bookings
-- Workers should only be notified 15 minutes before scheduled time, not immediately

-- =============================================================================
-- 1. FIX: Update Telegram notification trigger to SKIP scheduled bookings
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_telegram_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_telegram_url text;
  v_payload jsonb;
  v_resp http_response;
BEGIN
  -- Only trigger for new pending bookings
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- CRITICAL FIX: Only notify for INSTANT bookings
  -- Scheduled bookings will be handled by run_scheduled_prealerts() 15 minutes before scheduled time
  IF NEW.booking_type = 'scheduled' THEN
    RETURN NEW;
  END IF;

  -- Build the Telegram edge function URL
  v_telegram_url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/new-booking-telegram';

  -- Build payload matching the edge function's expected format
  v_payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'bookings',
    'record', jsonb_build_object(
      'id', NEW.id,
      'service_type', NEW.service_type,
      'booking_type', NEW.booking_type,
      'community', NEW.community,
      'flat_no', NEW.flat_no,
      'cust_name', NEW.cust_name,
      'cust_phone', NEW.cust_phone,
      'scheduled_date', NEW.scheduled_date,
      'scheduled_time', NEW.scheduled_time,
      'price_inr', NEW.price_inr,
      'status', NEW.status,
      'created_at', NEW.created_at
    ),
    'schema', 'public',
    'old_record', NULL
  );

  -- Send to Telegram edge function (only for instant bookings)
  BEGIN
    v_resp := http_post(v_telegram_url, v_payload::text, 'application/json');
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the booking insert
    RAISE WARNING 'Failed to send Telegram notification: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- =============================================================================
-- 2. VERIFY: Confirm run_scheduled_prealerts handles notifications correctly
-- =============================================================================
-- This function should send notifications 15 minutes before scheduled time
-- No changes needed here, just documenting the flow

COMMENT ON FUNCTION public.notify_telegram_new_booking() IS 
'Sends Telegram notification for INSTANT bookings only. Scheduled bookings are handled by run_scheduled_prealerts() 15 minutes before scheduled time.';

COMMENT ON FUNCTION public.notify_pushcut_new_booking() IS 
'Sends Pushcut notification for INSTANT bookings only. Scheduled bookings are handled by run_scheduled_prealerts() 15 minutes before scheduled time.';

COMMENT ON FUNCTION public.run_scheduled_prealerts(integer) IS 
'Processes scheduled bookings and sends notifications when they are within the specified window (default 15 minutes) of their scheduled time. This is the ONLY function that should notify workers about scheduled bookings.';
