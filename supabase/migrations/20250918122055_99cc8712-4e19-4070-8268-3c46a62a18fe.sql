-- Fix the Pushcut trigger to handle permission errors gracefully
-- This prevents user message sending from failing when they can't make HTTP requests

CREATE OR REPLACE FUNCTION public.trg_support_messages_pushcut()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_name  text;
  v_user_phone text;
  v_service    text;
  v_community  text;
  v_preview    text;
BEGIN
  -- only for user → admin messages
  IF NEW.sender <> 'user' THEN RETURN NEW; END IF;

  -- Use BEGIN/EXCEPTION to handle permission errors gracefully
  BEGIN
    v_preview := left(regexp_replace(coalesce(NEW.message,''), E'[\\r\\n]+', ' ', 'g'), 140);

    -- enrich from thread/profile
    SELECT p.full_name, p.phone
      INTO v_user_name, v_user_phone
      FROM support_threads t JOIN profiles p ON p.id = t.user_id
     WHERE t.id = NEW.thread_id;

    -- optional booking context
    BEGIN
      SELECT b.service_type, coalesce(b.community, b.community_id::text)
        INTO v_service, v_community
        FROM support_threads t JOIN bookings b ON b.id = t.booking_id
       WHERE t.id = NEW.thread_id;
    EXCEPTION WHEN others THEN
      v_service := null; v_community := null;
    END;

    -- Try to send notification, but don't fail if it doesn't work
    PERFORM public.pushcut_notify_support(
      NEW.thread_id, NEW.id, v_preview, v_user_name, v_user_phone, v_service, v_community
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the insert
    RAISE NOTICE 'Pushcut notification failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;