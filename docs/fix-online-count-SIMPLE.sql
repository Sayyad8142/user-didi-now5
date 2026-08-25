-- ============================================================================
-- RUN ON THE EXTERNAL DB (api.didisnow.com) SQL EDITOR — NOT Lovable Cloud.
-- Restores the legacy `online_count` field that published iOS/Android
-- (versionCode 6) reads via Number(row.online_count).
--
-- LIVE PROBE 2026-08-25 08:07 UTC (after your first attempt):
--   get_online_workers_count -> service, fresh_count, stale_count, total_count
--   projected online_count   -> ERROR "column pgrst_call.online_count does not exist"
--   get_online_workers_count_core -> does not exist
-- => the previous transaction ROLLED BACK. Almost certainly because
--    ALTER FUNCTION ...(text) did not match the real argument type
--    (e.g. it is character varying, or the function has no argument name).
--
-- STEP 0 below prints the real signature. Run STEP 0 first, then STEP 1.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 0 — DIAGNOSTIC (read-only). Paste the output back if STEP 1 fails.
-- ---------------------------------------------------------------------------
SELECT p.oid,
       p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       pg_get_function_result(p.oid)             AS result_type,
       p.proargnames,
       p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_online_workers_count', 'get_online_workers_count_core');

-- ---------------------------------------------------------------------------
-- STEP 1 — APPLY. Signature-agnostic: it discovers the real argument list and
-- renames using it, so it cannot fail on a text/varchar mismatch.
-- ---------------------------------------------------------------------------
BEGIN;

DO $ren$
DECLARE
  v_args text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_online_workers_count_core'
  ) THEN
    RAISE NOTICE 'core already exists, skipping rename';
  ELSE
    SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_online_workers_count'
    ORDER BY p.oid LIMIT 1;

    IF v_args IS NULL THEN
      RAISE EXCEPTION 'get_online_workers_count not found in schema public';
    END IF;

    EXECUTE format(
      'ALTER FUNCTION public.get_online_workers_count(%s) RENAME TO get_online_workers_count_core',
      v_args);
    RAISE NOTICE 'renamed get_online_workers_count(%) -> _core', v_args;
  END IF;
END $ren$;

-- The legacy name is now free. Recreate it as a thin wrapper that ADDS
-- online_count and keeps every existing field.
CREATE OR REPLACE FUNCTION public.get_online_workers_count(p_community text)
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

COMMIT;

-- STEP 2 — refresh the API schema cache.
NOTIFY pgrst, 'reload schema';

-- STEP 3 — VERIFY (must show a non-null online_count per row).
SELECT * FROM public.get_online_workers_count('prestige-high-fields');

-- ROLLBACK (only if needed)
-- BEGIN;
--   DROP FUNCTION public.get_online_workers_count(text);
--   ALTER FUNCTION public.get_online_workers_count_core(text)
--     RENAME TO get_online_workers_count;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
