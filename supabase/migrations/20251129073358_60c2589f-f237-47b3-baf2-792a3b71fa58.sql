
-- Create trigger to notify workers via FCM when instant bookings are created

-- Drop old broken triggers
DROP TRIGGER IF EXISTS trigger_enqueue_booking_push ON public.bookings;
DROP TRIGGER IF EXISTS trigger_enqueue_booking_push_v1 ON public.bookings;

-- Create new function that calls the working FCM edge function
CREATE OR REPLACE FUNCTION public.notify_workers_fcm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_worker_record RECORD;
  v_edge_function_url TEXT := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-worker-fcm';
BEGIN
  -- CRITICAL: Only fire for INSTANT bookings with 'pending' status
  -- Scheduled bookings are handled by run_scheduled_prealerts() 15 mins before scheduled time
  IF NEW.status <> 'pending' OR NEW.booking_type = 'scheduled' THEN
    RETURN NEW;
  END IF;

  -- Loop through eligible workers and send FCM notifications
  FOR v_worker_record IN
    SELECT 
      w.id as worker_id,
      ft.token as fcm_token
    FROM public.workers w
    JOIN public.fcm_tokens ft ON ft.user_id = w.id
    WHERE
      w.is_active = true
      AND w.is_available = true
      AND (COALESCE(w.service_types, '{}') @> ARRAY[NEW.service_type]::text[])
      AND (
        COALESCE(w.communities, '{}') = '{}'
        OR COALESCE(w.communities, '{}') @> ARRAY[NEW.community]::text[]
      )
      AND ft.token IS NOT NULL
  LOOP
    -- Call edge function to send FCM notification
    PERFORM net.http_post(
      url := v_edge_function_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'worker_id', v_worker_record.worker_id,
        'fcm_token', v_worker_record.fcm_token,
        'booking_id', NEW.id::text,
        'service_type', NEW.service_type,
        'community', NEW.community,
        'flat_no', COALESCE(NEW.flat_no, ''),
        'cust_name', NEW.cust_name
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Create trigger for instant bookings
CREATE TRIGGER trigger_notify_workers_fcm
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_workers_fcm();

COMMENT ON FUNCTION public.notify_workers_fcm() IS 
'Sends FCM push notifications to eligible workers when instant bookings are created. Scheduled bookings are handled separately by run_scheduled_prealerts().';
