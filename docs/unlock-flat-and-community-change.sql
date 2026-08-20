-- Allow users to change their community / flat from the app again.
--
-- Context: a trigger on public.profiles in the EXTERNAL database raises
--   "Flat number is locked after first booking. Contact support to change it."
-- whenever flat_no / flat_id / building_id / community_id are updated after the
-- user's first booking. That makes the Profile screen unable to save.
--
-- Run this on the external database (api.didisnow.com) with the SQL editor.
-- It drops every trigger on public.profiles whose function raises that message.

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tg.tgname, p.proname
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname = 'profiles'
      AND NOT tg.tgisinternal
      AND pg_get_functiondef(p.oid) ILIKE '%locked after first booking%'
  LOOP
    RAISE NOTICE 'Dropping trigger % (function %) on public.profiles', t.tgname, t.proname;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.profiles', t.tgname);
  END LOOP;
END $$;

-- Verify: should return no rows.
SELECT tg.tgname, p.proname
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = tg.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'profiles'
  AND NOT tg.tgisinternal
  AND pg_get_functiondef(p.oid) ILIKE '%locked after first booking%';
