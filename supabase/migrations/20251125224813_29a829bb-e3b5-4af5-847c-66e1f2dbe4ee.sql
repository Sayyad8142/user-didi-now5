
-- ============================================================================
-- FIX: Scheduled Booking Alert Bug
-- ============================================================================
-- PROBLEM: Workers are receiving instant FCM alerts for scheduled bookings
--          at the time of creation, instead of only 15 minutes before.
--
-- ROOT CAUSE: Multiple triggers fire on INSERT into bookings without checking
--             booking_type = 'scheduled'. These triggers send FCM immediately.
--
-- SOLUTION: Add booking_type = 'instant' guards to ALL notification triggers
--           so scheduled bookings only notify via run_scheduled_prealerts().
-- ============================================================================

-- 1. FIX: enqueue_booking_push() - Add booking_type check
CREATE OR REPLACE FUNCTION public.enqueue_booking_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- CRITICAL: Only fire for INSTANT bookings
  -- Scheduled bookings are handled by run_scheduled_prealerts() 15 mins before scheduled time
  IF NEW.status = 'pending' AND NEW.booking_type = 'instant' THEN
    PERFORM net.http_post(
      url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/booking-notifications',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('booking_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. FIX: enqueue_booking_push_v1() - Add booking_type check
CREATE OR REPLACE FUNCTION public.enqueue_booking_push_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fn_url text := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-onesignal';
  t text;
BEGIN
  -- CRITICAL: Only fire for INSTANT bookings with 'pending' status
  -- Scheduled bookings are handled by run_scheduled_prealerts() 15 mins before scheduled time
  IF NEW.status <> 'pending' OR NEW.booking_type = 'scheduled' THEN
    RETURN NEW;
  END IF;

  -- Loop through tokens of eligible workers
  FOR t IN
    SELECT ft.token
    FROM public.fcm_tokens ft
    JOIN public.workers w ON w.id = ft.user_id
    WHERE
      w.is_active = true
      AND w.is_available = true
      AND (COALESCE(w.service_types, '{}') @> ARRAY[NEW.service_type]::text[])
      AND (
        COALESCE(w.communities, '{}') = '{}'
        OR COALESCE(w.communities, '{}') @> ARRAY[NEW.community]::text[]
      )
  LOOP
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'token', t,
        'title', 'New Booking',
        'body', CONCAT(NEW.service_type, ' • ', NEW.community, ' • Flat ', COALESCE(NEW.flat_no,'')),
        'data', jsonb_build_object('booking_id', NEW.id::text)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 3. FIX: notify_workers_on_booking_created() - Use booking_type instead of scheduled_date
CREATE OR REPLACE FUNCTION public.notify_workers_on_booking_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- CRITICAL: Only send immediate notifications for INSTANT bookings
  -- Scheduled bookings are handled by run_scheduled_prealerts() 15 mins before scheduled time
  IF NEW.booking_type = 'instant' THEN
    -- Call the booking-notifications edge function for instant bookings
    PERFORM net.http_post(
      url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/booking-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTE2OTI2OSwiZXhwIjoyMDcwNzQ1MjY5fQ.xZ7TTPwf_1MStOE6s0P7hXkpGIwwJP2K0vcx5wVqlI0'
      ),
      body := jsonb_build_object('booking_id', NEW.id::text)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 4. FIX: queue_intelligent_booking_notification() - Add booking_type check
CREATE OR REPLACE FUNCTION public.queue_intelligent_booking_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    notification_title TEXT;
    notification_body TEXT;
    notification_data JSONB;
    available_experts_count INTEGER;
BEGIN
    -- CRITICAL: Only fire for INSTANT bookings
    -- Scheduled bookings are handled by run_scheduled_prealerts() 15 mins before scheduled time
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.booking_type = 'instant' THEN
        notification_title := '🔔 New Booking Request';
        notification_body := NEW.service_type || ' service at ' || NEW.community;
        notification_data := jsonb_build_object(
            'booking_id', NEW.id,
            'service_type', NEW.service_type,
            'community', NEW.community,
            'type', 'BOOKING_ALERT'
        );

        -- Insert notification into queue
        INSERT INTO public.notification_queue (
            title,
            body,
            booking_id,
            notification_type,
            data,
            status
        ) VALUES (
            notification_title,
            notification_body,
            NEW.id,
            'booking_request',
            notification_data,
            'pending'
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- 5. FIX: trigger_booking_assignment() - Ensure it only fires for instant bookings
CREATE OR REPLACE FUNCTION public.trigger_booking_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    -- CRITICAL: Only trigger for INSTANT bookings with 'pending' status
    -- Scheduled bookings are handled by run_scheduled_prealerts() 15 mins before scheduled time
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.booking_type = 'instant' THEN
        -- Start the booking assignment process for instant bookings only
        SELECT initiate_booking_assignment(
            NEW.id,
            NEW.service_type,
            NEW.community
        ) INTO v_result;
        
        -- Log the result
        RAISE NOTICE 'Booking assignment initiated for INSTANT booking %: %', NEW.id, v_result;
        
        -- If assignment failed, log warning
        IF NOT (v_result->>'success')::boolean THEN
            RAISE WARNING 'Failed to initiate booking assignment for booking %: %', NEW.id, v_result->>'error';
        END IF;
    ELSIF NEW.booking_type = 'scheduled' THEN
        RAISE NOTICE 'Scheduled booking % created - will be notified 15 mins before scheduled time', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- ============================================================================
-- VERIFICATION: Log the fix
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed scheduled booking alert bug - All notification triggers now check booking_type';
  RAISE NOTICE '   - enqueue_booking_push: Added booking_type = instant check';
  RAISE NOTICE '   - enqueue_booking_push_v1: Added booking_type = instant check';
  RAISE NOTICE '   - notify_workers_on_booking_created: Changed to use booking_type';
  RAISE NOTICE '   - queue_intelligent_booking_notification: Added booking_type = instant check';
  RAISE NOTICE '   - trigger_booking_assignment: Added booking_type = instant check';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Scheduled bookings will now ONLY notify workers via run_scheduled_prealerts()';
  RAISE NOTICE '   - Which runs every minute via didinow_prealerts_every_minute cron job';
  RAISE NOTICE '   - And sends FCM alerts 15 minutes before the scheduled time';
END $$;
