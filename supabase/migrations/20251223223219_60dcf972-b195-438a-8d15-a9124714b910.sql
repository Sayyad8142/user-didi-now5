-- Create function to enqueue user booking push notifications
CREATE OR REPLACE FUNCTION public.enqueue_user_booking_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_should_send BOOLEAN := false;
BEGIN
  -- On INSERT: send "Booking Created" push
  IF TG_OP = 'INSERT' THEN
    v_title := 'Booking Created';
    v_body := 'Your ' || NEW.service_type || ' booking has been created';
    v_should_send := true;
  
  -- On UPDATE: only send when status actually changes
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Worker assigned/accepted/confirmed
    IF NEW.status IN ('assigned', 'accepted', 'confirmed') AND OLD.status NOT IN ('assigned', 'accepted', 'confirmed') THEN
      v_title := 'Worker Assigned';
      v_body := COALESCE(NEW.worker_name, 'A worker') || ' has been assigned to your booking';
      v_should_send := true;
    
    -- Booking cancelled
    ELSIF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
      v_title := 'Booking Cancelled';
      v_body := 'Your ' || NEW.service_type || ' booking has been cancelled';
      v_should_send := true;
    
    -- Worker on the way
    ELSIF NEW.status = 'on_the_way' AND OLD.status != 'on_the_way' THEN
      v_title := 'Worker On The Way';
      v_body := COALESCE(NEW.worker_name, 'Your worker') || ' is on the way';
      v_should_send := true;
    
    -- Work started
    ELSIF NEW.status = 'started' AND OLD.status != 'started' THEN
      v_title := 'Work Started';
      v_body := 'Your ' || NEW.service_type || ' service has started';
      v_should_send := true;
    
    -- Work completed
    ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
      v_title := 'Booking Completed';
      v_body := 'Your ' || NEW.service_type || ' booking has been completed. Rate your experience!';
      v_should_send := true;
    END IF;
  END IF;

  -- Send push notification via edge function
  IF v_should_send THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://paywwbuqycovjopryele.supabase.co/functions/v1/send-user-fcm',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
        ),
        body := jsonb_build_object(
          'user_id', NEW.user_id,
          'title', v_title,
          'body', v_body,
          'data', jsonb_build_object(
            'booking_id', NEW.id::text,
            'status', NEW.status,
            'service_type', NEW.service_type
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Failed to send user push notification: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger for booking push notifications
DROP TRIGGER IF EXISTS trg_booking_user_push ON public.bookings;
CREATE TRIGGER trg_booking_user_push
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_user_booking_push();