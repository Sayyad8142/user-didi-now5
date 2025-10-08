-- Add Telegram notification to existing booking trigger
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

  -- Send to Telegram edge function
  BEGIN
    v_resp := http_post(v_telegram_url, v_payload::text, 'application/json');
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the booking insert
    RAISE WARNING 'Failed to send Telegram notification: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- Create trigger for Telegram notifications on new bookings
DROP TRIGGER IF EXISTS trigger_telegram_new_booking ON public.bookings;
CREATE TRIGGER trigger_telegram_new_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_new_booking();