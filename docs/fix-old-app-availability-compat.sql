-- ============================================================================
-- BACKWARD-COMPATIBILITY FIX FOR ALREADY-PUBLISHED iOS / ANDROID APPS
-- Run on the EXTERNAL Supabase project (api.didisnow.com) SQL editor ONLY.
-- Safe to re-run (idempotent). Wrapped in a single transaction.
--
-- PROBLEM (evidence 2026-08-25):
--   get_online_workers_count('prestige-high-fields') currently returns
--     [{ service:'maid', fresh_count:6, stale_count:0, total_count:6 }, ...]
--   The PUBLISHED app (versionCode 6) reads ONLY row.online_count -> NaN
--     -> NaN > 0 === false -> "No workers available", Instant disabled.
--   Secondary: check_instant_supply(community) counts ALL active instant
--   bookings community-wide; the old app blocks at >= 3, so three bookings in
--   any service froze every service.
--
-- STRATEGY (no app release needed, nothing removed):
--   * The current function is RENAMED to get_online_workers_count_core.
--     Renaming preserves OID, so every view / plpgsql function / dispatch
--     routine that already references it keeps working unchanged.
--   * A thin SECURITY DEFINER wrapper re-takes the legacy name and returns
--     the legacy `online_count` PLUS fresh_count / stale_count / total_count.
--     Its body is generated from the columns the core function actually
--     returns, so it adapts to the deployed definition.
--   * check_instant_supply keeps its legacy name + signature and returns the
--     legacy blocking value 3 ONLY when a real per-service cap is full.
--   * No RLS change, no table change, no grant is revoked.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preconditions: the legacy function must exist exactly once as (text).
-- ---------------------------------------------------------------------------
DO $pre$
DECLARE
  v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_online_workers_count', 'get_online_workers_count_core');
  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'get_online_workers_count(text) not found in schema public - aborting';
  END IF;
END $pre$;

-- ---------------------------------------------------------------------------
-- 1. Rename the live implementation to *_core (only once).
-- ---------------------------------------------------------------------------
DO $ren$
DECLARE
  v_core_exists boolean;
  v_args        text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_online_workers_count_core'
  ) INTO v_core_exists;

  IF v_core_exists THEN
    RAISE NOTICE 'get_online_workers_count_core already present - skipping rename';
    RETURN;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_online_workers_count'
  ORDER BY p.oid LIMIT 1;

  EXECUTE format(
    'ALTER FUNCTION public.get_online_workers_count(%s) RENAME TO get_online_workers_count_core',
    v_args
  );
  RAISE NOTICE 'renamed get_online_workers_count(%) -> get_online_workers_count_core', v_args;
END $ren$;

-- ---------------------------------------------------------------------------
-- 2. Build the legacy-named compatibility wrapper from the core function's
--    real output columns. online_count = live/fresh eligible worker count.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_online_workers_count(text);

DO $wrap$
DECLARE
  v_cols       text[];
  v_live_expr  text;
  v_fresh_expr text;
  v_stale_expr text;
  v_total_expr text;
BEGIN
  SELECT coalesce(array_agg(a.name), '{}'::text[]) INTO v_cols
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL unnest(coalesce(p.proargnames, '{}'::text[]),
                            coalesce(p.proargmodes, array_fill('i'::"char", ARRAY[coalesce(array_length(p.proargnames,1),0)]))
                           ) AS a(name, mode)
  WHERE n.nspname = 'public'
    AND p.proname = 'get_online_workers_count_core'
    AND a.mode IN ('o', 't', 'b');

  RAISE NOTICE 'core output columns: %', v_cols;

  -- Live/eligible-now count: prefer an explicit fresh/online column,
  -- then total, then any single count column.
  v_fresh_expr := CASE WHEN 'fresh_count'  = ANY(v_cols) THEN 'c.fresh_count'
                       WHEN 'online_count' = ANY(v_cols) THEN 'c.online_count'
                       WHEN 'total_count'  = ANY(v_cols) THEN 'c.total_count'
                       WHEN 'count'        = ANY(v_cols) THEN 'c."count"'
                       ELSE NULL END;
  IF v_fresh_expr IS NULL THEN
    RAISE EXCEPTION 'cannot locate a count column on get_online_workers_count_core (cols: %)', v_cols;
  END IF;

  v_total_expr := CASE WHEN 'total_count'  = ANY(v_cols) THEN 'c.total_count'
                       ELSE v_fresh_expr END;
  v_stale_expr := CASE WHEN 'stale_count'  = ANY(v_cols) THEN 'c.stale_count'
                       ELSE '0' END;
  v_live_expr  := v_fresh_expr;

  EXECUTE format($f$
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
    AS $body$
      SELECT c.service::text,
             (%s)::integer AS online_count,
             (%s)::integer AS fresh_count,
             (%s)::integer AS stale_count,
             (%s)::integer AS total_count
      FROM public.get_online_workers_count_core(p_community) AS c;
    $body$;
  $f$, v_live_expr, v_fresh_expr, v_stale_expr, v_total_expr);
END $wrap$;

GRANT EXECUTE ON FUNCTION public.get_online_workers_count(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_online_workers_count_core(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Per-service instant limits (mirrors supabase/functions/_shared/capacityRules.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instant_limit_for_service(p_service_type text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(p_service_type, ''))
    WHEN 'maid'              THEN 3
    WHEN 'floor_cleaning'    THEN 3
    WHEN 'dishwashing'       THEN 2
    WHEN 'dish_washing'      THEN 2
    WHEN 'bathroom_cleaning' THEN 1
    ELSE 3
  END;
$$;

GRANT EXECUTE ON FUNCTION public.instant_limit_for_service(text)
  TO anon, authenticated, service_role;

-- Service-aware counter used by the new build / edge gates (idempotent).
CREATE OR REPLACE FUNCTION public.check_instant_supply_for_service(
  p_community    text,
  p_service_type text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM bookings
  WHERE community    = p_community
    AND service_type = p_service_type
    AND booking_type = 'instant'
    AND status IN ('pending','dispatched','accepted',
                   'confirmed','on_the_way','in_progress');
$$;

GRANT EXECUTE ON FUNCTION public.check_instant_supply_for_service(text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. check_instant_supply(community): legacy name + signature, honest answer.
--    Old clients block when the value is >= 3, so return 3 ONLY when a real
--    per-service cap is full; otherwise clamp to 2 so a busy-but-bookable
--    community never falsely blocks every service.
--    Real protection is unchanged: the insert trigger and the
--    check-booking-capacity edge gate still run before any payment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_instant_supply(p_community text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_any_full   boolean;
  v_max_active integer;
BEGIN
  WITH per_service AS (
    SELECT b.service_type,
           count(*)::integer AS active_count,
           public.instant_limit_for_service(b.service_type) AS limit_count
    FROM bookings b
    WHERE b.community    = p_community
      AND b.booking_type = 'instant'
      AND b.status IN ('pending','dispatched','accepted',
                       'confirmed','on_the_way','in_progress')
    GROUP BY b.service_type
  )
  SELECT bool_or(active_count >= limit_count),
         coalesce(max(active_count), 0)
    INTO v_any_full, v_max_active
    FROM per_service;

  IF coalesce(v_any_full, false) THEN
    RETURN 3;                                   -- legacy "supply full" signal
  END IF;

  RETURN LEAST(coalesce(v_max_active, 0), 2);   -- never trips the old gate
END $$;

GRANT EXECUTE ON FUNCTION public.check_instant_supply(text)
  TO anon, authenticated, service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. VERIFY (run after commit)
-- ---------------------------------------------------------------------------
-- SELECT * FROM public.get_online_workers_count('prestige-high-fields');
--   -> every row must have a non-null online_count (= fresh/live count)
-- SELECT public.check_instant_supply('prestige-high-fields');
--   -> 0..2 when bookable, 3 only when a per-service cap is genuinely full
-- SELECT public.check_instant_supply_for_service('prestige-high-fields','maid');

-- ---------------------------------------------------------------------------
-- 6. ROLLBACK (only if ever needed)
-- ---------------------------------------------------------------------------
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.get_online_workers_count(text);
--   ALTER FUNCTION public.get_online_workers_count_core(text)
--     RENAME TO get_online_workers_count;
--   GRANT EXECUTE ON FUNCTION public.get_online_workers_count(text)
--     TO anon, authenticated, service_role;
-- COMMIT;
