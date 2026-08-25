-- ============================================================================
-- RUN THIS ON THE EXTERNAL DB (api.didisnow.com) SQL EDITOR — WHOLE FILE.
-- Restores the legacy `online_count` column that published iOS/Android
-- (versionCode 6) reads. No dynamic DO blocks: every statement is literal,
-- so nothing can be silently skipped.
--
-- CURRENT PROBED SHAPE (2026-08-25 08:04 UTC):
--   get_online_workers_count('prestige-high-fields')
--     -> [{service:'bathroom_cleaning', fresh_count:5, stale_count:0, total_count:5},
--         {service:'maid',              fresh_count:6, stale_count:0, total_count:6}]
--   -> old app does Number(row.online_count) => NaN => "No workers available".
-- ============================================================================

BEGIN;

-- 1. Move the live implementation aside (OID preserved, all internal callers keep working).
ALTER FUNCTION public.get_online_workers_count(text)
  RENAME TO get_online_workers_count_core;

-- 2. Re-take the legacy name with a superset of columns.
CREATE FUNCTION public.get_online_workers_count(p_community text)
RETURNS TABLE (
  service      text,
  online_count integer,
  fresh_count  integer,
  stale_count  integer,
  total_count  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.service::text,
         c.fresh_count::integer AS online_count,   -- legacy field, live workers
         c.fresh_count::integer,
         c.stale_count::integer,
         c.total_count::integer
  FROM public.get_online_workers_count_core(p_community) AS c;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_workers_count(text)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_online_workers_count_core(text) TO anon, authenticated, service_role;

COMMIT;

-- 3. Make PostgREST pick the new signature up immediately.
NOTIFY pgrst, 'reload schema';

-- 4. VERIFY — every row must show a non-null online_count.
-- SELECT * FROM public.get_online_workers_count('prestige-high-fields');

-- ROLLBACK (only if needed)
-- BEGIN;
--   DROP FUNCTION public.get_online_workers_count(text);
--   ALTER FUNCTION public.get_online_workers_count_core(text)
--     RENAME TO get_online_workers_count;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
