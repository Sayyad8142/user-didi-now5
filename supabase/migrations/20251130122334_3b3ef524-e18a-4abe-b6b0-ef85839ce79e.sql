-- ============================================================================
-- FIX: Worker Notifications for New Communities
-- ============================================================================
-- PROBLEM: Workers not receiving FCM notifications for bookings in newly
--          created communities like "my_home_avatar"
--
-- ROOT CAUSE: The enqueue_booking_push_v1() function calls a non-existent
--             edge function (send-onesignal) which silently fails
--
-- SOLUTION: Replace with direct FCM sending logic using send-worker-fcm
--           edge function that properly exists
-- ============================================================================

-- Drop the old broken function
DROP FUNCTION IF EXISTS public.enqueue_booking_push_v1() CASCADE;

-- Create new working FCM notification function
CREATE OR REPLACE FUNCTION public.notify_workers_fcm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-worker-fcm';
  worker_token text;
BEGIN
  -- CRITICAL: Only fire for INSTANT bookings with 'pending' status
  -- Scheduled bookings are handled by run_scheduled_prealerts() 15 mins before scheduled time
  IF NEW.status <> 'pending' OR NEW.booking_type = 'scheduled' THEN
    RETURN NEW;
  END IF;

  RAISE NOTICE '🔔 Processing FCM notifications for booking % in community %', NEW.id, NEW.community;

  -- Loop through tokens of eligible workers
  FOR worker_token IN
    SELECT ft.token
    FROM public.fcm_tokens ft
    JOIN public.workers w ON w.id = ft.user_id
    WHERE
      w.is_active = true
      AND w.is_available = true
      AND (COALESCE(w.service_types, '{}') @> ARRAY[NEW.service_type]::text[])
      AND (
        COALESCE(w.communities, '{}') = '{}'  -- NULL or empty matches all
        OR COALESCE(w.communities, '{}') @> ARRAY[NEW.community]::text[]
      )
  LOOP
    RAISE NOTICE '📤 Sending FCM to worker for booking %', NEW.id;
    
    -- Send FCM via edge function
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'token', worker_token,
        'title', 'New Booking',
        'body', CONCAT(NEW.service_type, ' • ', NEW.community, ' • Flat ', COALESCE(NEW.flat_no,'')),
        'data', jsonb_build_object('booking_id', NEW.id::text, 'type', 'BOOKING_ALERT')
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Recreate the trigger 
DROP TRIGGER IF EXISTS trigger_notify_workers_fcm ON public.bookings;

CREATE TRIGGER trigger_notify_workers_fcm
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_workers_fcm();

-- Log the fix
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed worker FCM notifications';
  RAISE NOTICE '   - Replaced broken enqueue_booking_push_v1 with notify_workers_fcm';
  RAISE NOTICE '   - Now uses send-worker-fcm edge function';
  RAISE NOTICE '   - Workers with NULL or empty communities array will match ALL communities';
  RAISE NOTICE '   - Workers with specific communities will only match those communities';
END $$;