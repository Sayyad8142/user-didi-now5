-- A) Supabase – SQL migration (RLS, helpers, triggers, indexes)

-- 1) Ensure RLS is on
ALTER TABLE IF EXISTS public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_messages ENABLE ROW LEVEL SECURITY;

-- 2) Policies — users see only their own thread; admins see all.
DROP POLICY IF EXISTS st_user_own ON public.support_threads;
DROP POLICY IF EXISTS st_admin_all ON public.support_threads;
CREATE POLICY st_user_own ON public.support_threads
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY st_admin_all ON public.support_threads
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS sm_user_own_thread ON public.support_messages;
DROP POLICY IF EXISTS sm_admin_all ON public.support_messages;
CREATE POLICY sm_user_own_thread ON public.support_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id = support_messages.thread_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id = support_messages.thread_id
        AND t.user_id = auth.uid()
    )
  );
CREATE POLICY sm_admin_all ON public.support_messages
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) Helper RPC to get or create a thread (prevents race conditions)
CREATE OR REPLACE FUNCTION public.support_get_or_create_thread(p_booking_id uuid DEFAULT NULL)
RETURNS public.support_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.support_threads;
BEGIN
  SELECT * INTO v_thread
    FROM public.support_threads
   WHERE user_id = auth.uid()
     AND COALESCE(booking_id,'00000000-0000-0000-0000-000000000000') = COALESCE(p_booking_id,'00000000-0000-0000-0000-000000000000')
   ORDER BY updated_at DESC
   LIMIT 1;

  IF v_thread.id IS NOT NULL THEN
    RETURN v_thread;
  END IF;

  INSERT INTO public.support_threads (user_id, booking_id, last_message, last_sender)
  VALUES (auth.uid(), p_booking_id, NULL, NULL)
  RETURNING * INTO v_thread;

  RETURN v_thread;
END;
$$;
GRANT EXECUTE ON FUNCTION public.support_get_or_create_thread(uuid) TO authenticated;

-- 4) Trigger to keep thread in sync on new messages
CREATE OR REPLACE FUNCTION public.support_update_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_threads
     SET last_message = NEW.message,
         last_sender  = NEW.sender,
         updated_at   = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_update_thread_trigger ON public.support_messages;
CREATE TRIGGER support_update_thread_trigger
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_update_thread();

-- 5) Seen helper (admin marks user messages as seen)
CREATE OR REPLACE FUNCTION public.support_mark_seen(p_thread uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.support_messages
     SET seen = true, seen_at = now()
   WHERE thread_id = p_thread
     AND sender = 'user'
     AND seen = false;
$$;
GRANT EXECUTE ON FUNCTION public.support_mark_seen(uuid) TO authenticated;

-- 6) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sm_thread_created ON public.support_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_st_updated ON public.support_threads(updated_at DESC);
