-- ============================================================================
-- RUN ON THE EXTERNAL DB (api.didisnow.com) SQL EDITOR — NOT Lovable Cloud.
-- Restores legacy `online_count` for published apps (versionCode 6).
--
-- LIVE PROBE 2026-08-25 08:36 UTC (after fix-online-count-SIMPLE.sql):
--   get_online_workers_count('prestige-high-fields')
--     -> [{service:bathroom_cleaning, fresh_count:5, stale_count:0, total_count:5},
--         {service:maid,              fresh_count:6, stale_count:0, total_count:6}]
--   select=online_count -> 42703 column pgrst_call.online_count does not exist
--   get_online_workers_count_core -> DOES NOT EXIST
--   => SIMPLE.sql did NOT commit. Run the blocks below ONE AT A TIME and paste
--      the error/output of whichever block fails.
-- ============================================================================

-- ####### BLOCK 1 — diagnostic (read-only). Paste output. ####################
SELECT p.oid,
       p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       pg_get_function_result(p.oid)             AS result_type,
       p.prosecdef,
       pg_get_userbyid(p.proowner)               AS owner
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'get_online_workers_count%';

-- ####### BLOCK 2 — rename ONLY. Run alone. #################################
-- If this errors with "function does not exist", copy the identity_args from
-- BLOCK 1 into the parentheses (e.g. (character varying)).
ALTER FUNCTION public.get_online_workers_count(text)
  RENAME TO get_online_workers_count_core;

-- Verify BLOCK 2 (must return exactly one row, proname = ..._core):
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc WHERE proname LIKE 'get_online_workers_count%';

-- ####### BLOCK 3 — create the legacy-compatible wrapper. Run alone. #########
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
         c.fresh_count::integer AS online_count,   -- legacy field = live workers
         c.fresh_count::integer,
         c.stale_count::integer,
         c.total_count::integer
  FROM public.get_online_workers_count_core(p_community) AS c;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_workers_count(text)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_online_workers_count_core(text) TO anon, authenticated, service_role;

-- ####### BLOCK 4 — reload API cache + verify. Run alone. ####################
NOTIFY pgrst, 'reload schema';
SELECT * FROM public.get_online_workers_count('prestige-high-fields');
-- Expected: online_count = 6 for maid, 5 for bathroom_cleaning.

-- ####### ROLLBACK (only if needed) ##########################################
-- DROP FUNCTION public.get_online_workers_count(text);
-- ALTER FUNCTION public.get_online_workers_count_core(text) RENAME TO get_online_workers_count;
-- NOTIFY pgrst, 'reload schema';
