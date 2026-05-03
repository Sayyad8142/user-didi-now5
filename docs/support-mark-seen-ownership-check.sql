-- Harden support_mark_seen RPC: only allow the thread owner or an admin
-- to mark a thread's user-sent messages as seen. Run this in the Supabase
-- SQL editor against the api.didisnow.com database.

CREATE OR REPLACE FUNCTION public.support_mark_seen(p_thread uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.support_threads
      WHERE id = p_thread AND user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.support_messages
     SET seen = true, seen_at = now()
   WHERE thread_id = p_thread
     AND sender = 'user'
     AND seen = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.support_mark_seen(uuid) TO authenticated;
