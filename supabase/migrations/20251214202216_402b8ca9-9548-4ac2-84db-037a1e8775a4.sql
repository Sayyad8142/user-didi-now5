-- Fix the support_get_or_create_thread function to use get_profile_id() instead of auth.uid()
CREATE OR REPLACE FUNCTION public.support_get_or_create_thread(p_booking_id uuid DEFAULT NULL)
RETURNS public.support_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.support_threads;
  v_profile_id uuid;
BEGIN
  -- Get the profile UUID from Firebase UID
  SELECT id INTO v_profile_id FROM public.profiles WHERE firebase_uid = auth.uid()::text LIMIT 1;
  
  -- If no profile found, raise error
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  -- Find existing thread using profile UUID
  SELECT * INTO v_thread
   FROM public.support_threads
   WHERE user_id = v_profile_id
     AND COALESCE(booking_id,'00000000-0000-0000-0000-000000000000') = COALESCE(p_booking_id,'00000000-0000-0000-0000-000000000000')
   ORDER BY updated_at DESC
   LIMIT 1;

  IF v_thread.id IS NOT NULL THEN
    RETURN v_thread;
  END IF;

  -- Create new thread using profile UUID
  INSERT INTO public.support_threads (user_id, booking_id, last_message, last_sender)
  VALUES (v_profile_id, p_booking_id, NULL, NULL)
  RETURNING * INTO v_thread;

  RETURN v_thread;
END;
$$;

-- Fix support_mark_seen function to use profile UUID
CREATE OR REPLACE FUNCTION public.support_mark_seen(p_thread uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  -- Get the profile UUID from Firebase UID
  SELECT id INTO v_profile_id FROM public.profiles WHERE firebase_uid = auth.uid()::text LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Only update if the thread belongs to this user
  UPDATE public.support_messages
  SET seen = true, seen_at = now()
  WHERE thread_id = p_thread
    AND sender = 'admin'
    AND seen = false
    AND EXISTS (
      SELECT 1 FROM public.support_threads t 
      WHERE t.id = p_thread AND t.user_id = v_profile_id
    );
END;
$$;

-- Fix mark_support_messages_as_seen function
CREATE OR REPLACE FUNCTION public.mark_support_messages_as_seen(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  -- Get the profile UUID from Firebase UID
  SELECT id INTO v_profile_id FROM public.profiles WHERE firebase_uid = auth.uid()::text LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Only update if the thread belongs to this user
  UPDATE public.support_messages
  SET seen = true, seen_at = now()
  WHERE thread_id = p_thread_id
    AND sender = 'admin'
    AND seen = false
    AND EXISTS (
      SELECT 1 FROM public.support_threads t 
      WHERE t.id = p_thread_id AND t.user_id = v_profile_id
    );
END;
$$;