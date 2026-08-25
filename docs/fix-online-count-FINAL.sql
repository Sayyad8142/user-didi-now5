-- ============================================================================
-- RUN ON THE EXTERNAL PRODUCTION DATABASE (api.didisnow.com).
-- Backward-compatible repair for published builds that read row.online_count.
--
-- Why SIMPLE.sql rolled back:
-- its final GRANT assumed the original RPC argument type was `text`. If the
-- live function uses another identity argument (for example varchar), that
-- GRANT fails and rolls back the preceding rename and wrapper creation.
-- This version discovers the exact signature and uses it for both operations.
-- ============================================================================

BEGIN;

DO $repair$
DECLARE
  v_original_args text;
  v_core_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid)
    INTO v_core_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_online_workers_count_core'
  ORDER BY p.oid
  LIMIT 1;

  IF v_core_args IS NULL THEN
    SELECT pg_get_function_identity_arguments(p.oid)
      INTO v_original_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_online_workers_count'
    ORDER BY p.oid
    LIMIT 1;

    IF v_original_args IS NULL THEN
      RAISE EXCEPTION 'public.get_online_workers_count was not found';
    END IF;

    EXECUTE format(
      'ALTER FUNCTION public.get_online_workers_count(%s) RENAME TO get_online_workers_count_core',
      v_original_args
    );
    v_core_args := v_original_args;
  ELSE
    -- Remove only an incomplete wrapper left by an earlier partial attempt.
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'get_online_workers_count'
    ) THEN
      DROP FUNCTION public.get_online_workers_count(text);
    END IF;
  END IF;

  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.get_online_workers_count_core(%s) TO anon, authenticated, service_role',
    v_core_args
  );
END
$repair$;

CREATE FUNCTION public.get_online_workers_count(p_community text)
RETURNS TABLE (
  service text,
  online_count integer,
  fresh_count integer,
  stale_count integer,
  total_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.service::text,
         c.fresh_count::integer AS online_count,
         c.fresh_count::integer,
         c.stale_count::integer,
         c.total_count::integer
  FROM public.get_online_workers_count_core(p_community) AS c;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_workers_count(text)
  TO anon, authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- REQUIRED VERIFICATION: every row must contain all five fields.
SELECT service, online_count, fresh_count, stale_count, total_count
FROM public.get_online_workers_count('prestige-high-fields')
ORDER BY service;
