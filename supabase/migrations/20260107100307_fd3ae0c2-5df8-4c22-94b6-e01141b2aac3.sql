-- Drop duplicate copy_worker triggers (keep only one)
DROP TRIGGER IF EXISTS copy_worker_data_trigger ON public.bookings;
DROP TRIGGER IF EXISTS copy_worker_trigger ON public.bookings;
DROP TRIGGER IF EXISTS trg_booking_copy_worker ON public.bookings;
-- Keep trigger_copy_worker_into_booking

-- Drop duplicate booking assignment triggers (keep only one)
DROP TRIGGER IF EXISTS on_booking_insert_notify ON public.bookings;
-- Keep trigger_auto_booking_assignment

-- Drop duplicate updated_at triggers (keep only one)
DROP TRIGGER IF EXISTS bookings_updated_at ON public.bookings;
-- Keep update_bookings_updated_at

-- Drop duplicate worker busy reset triggers (keep only one)  
DROP TRIGGER IF EXISTS trg_auto_reset_worker_busy ON public.bookings;
-- Keep trigger_auto_reset_worker_busy

-- Drop redundant notification triggers that may be causing timeouts
-- These make synchronous HTTP calls which can cause statement timeout
DROP TRIGGER IF EXISTS on_booking_created_notify_workers ON public.bookings;

-- Make notify_pushcut_new_booking async using pg_net instead of blocking http
-- First drop the existing function and recreate with pg_net
CREATE OR REPLACE FUNCTION notify_pushcut_new_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url  text;
  v_open text;
  v_payload jsonb;
BEGIN
  SELECT value INTO v_url FROM public.ops_settings WHERE key='pushcut_booking_url';
  SELECT value INTO v_open FROM public.ops_settings WHERE key='admin_open_url';

  IF v_url IS NULL OR v_url = '' OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- Skip scheduled bookings
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

  -- Use pg_net for async HTTP call (non-blocking)
  PERFORM net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := v_payload
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the transaction on notification errors
  RETURN NEW;
END;
$$;