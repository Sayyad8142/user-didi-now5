-- Fix support chat send failures: remove broken notification trigger
-- Root cause: trigger function referenced non-existent Postgres GUCs (current_setting('supabase.url'), 'supabase.service_role_key')

DROP TRIGGER IF EXISTS on_new_support_message ON public.support_messages;

-- Keep function as a safe no-op to prevent future accidental trigger re-add from breaking inserts
CREATE OR REPLACE FUNCTION public.notify_admins_new_support_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN NEW;
END;
$$;