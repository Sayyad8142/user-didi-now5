-- Create function to send booking status update notifications
CREATE OR REPLACE FUNCTION notify_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_fcm_token TEXT;
  v_worker_name TEXT;
BEGIN
  -- Only proceed if status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Get user's FCM token
    SELECT token INTO v_fcm_token
    FROM fcm_tokens
    WHERE user_id = NEW.user_id;
    
    -- Get worker name if assigned
    IF NEW.worker_id IS NOT NULL THEN
      SELECT full_name INTO v_worker_name
      FROM workers
      WHERE id = NEW.worker_id;
    END IF;
    
    -- If FCM token exists, send notification via edge function
    IF v_fcm_token IS NOT NULL THEN
      -- Call edge function to send notification
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/notify-booking-update',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object(
          'booking_id', NEW.id,
          'status', NEW.status,
          'worker_name', v_worker_name
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for booking status changes
DROP TRIGGER IF EXISTS booking_status_notification_trigger ON bookings;
CREATE TRIGGER booking_status_notification_trigger
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_status_change();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA net TO postgres, anon, authenticated, service_role;