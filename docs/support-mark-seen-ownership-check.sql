-- Harden public.support_mark_seen() to enforce ownership/admin check.
-- Run this in the EXTERNAL Supabase project (api.didisnow.com /
-- paywwbuqycovjopryele) SQL editor. Lovable AI cannot execute DDL on the
-- hybrid backend.
--
-- Problem: SECURITY DEFINER lets the function bypass RLS. Without an explicit
-- ownership check, any authenticated user could call this RPC with another
-- user's thread id and mark their messages as seen.
--
-- Fix: Verify the caller is either an admin OR the owner of the thread
-- before performing the update.

CREATE OR REPLACE FUNCTION public.support_mark_seen(p_thread uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_threads
      WHERE id = p_thread AND user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.support_messages
     SET seen = true,
         seen_at = now()
   WHERE thread_id = p_thread
     AND sender   = 'user'
     AND seen     = false;
END;
$$;

-- Keep execution restricted to authenticated callers (defense in depth).
REVOKE ALL ON FUNCTION public.support_mark_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_mark_seen(uuid) TO authenticated, service_role;
