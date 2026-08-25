-- ============================================================================
-- BACKWARD-COMPATIBILITY FIX FOR ALREADY-PUBLISHED iOS / ANDROID APPS
-- Apply on the EXTERNAL Supabase project (api.didisnow.com) ONLY.
--
-- PROBLEM (evidence captured 2026-08-25 via worker-audit):
--   get_online_workers_count('prestige-high-fields') returns
--     [{ service: 'maid', fresh_count: 6, stale_count: 0, total_count: 6 }, ...]
--   The PUBLISHED app (versionCode 6) reads ONLY `row.online_count`:
--     result[row.service] = Number(row.online_count);   -->  NaN
--   NaN > 0 === false  -->  isServiceAvailable() false
--     -->  "No workers available" / Instant button disabled.
--   The newer dev build reads online_count ?? total_count ?? fresh_count, so
--   it works. Same DB, same RPC, different client-side field expectation.
--
--   Secondary blocker: check_instant_supply(community) was widened to count
--   ALL active instant bookings community-wide across 6 statuses. The old app
--   compares that number against a hardcoded 3 (MAX_PENDING_INSTANT) and shows
--   "All experts are busy right now" even when the per-service cap is free.
--
-- FIX STRATEGY: keep both legacy RPC names + signatures, keep every existing
-- output field, and make them return the authoritative answer plus the legacy
-- field names the old bundles read. No app update required. No availability is
-- faked — genuine per-service capacity limits still block.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. get_online_workers_count: re-add the legacy `online_count` column
--    WITHOUT reimplementing the eligibility logic. The existing function is
--    renamed to *_core and a thin compatibility wrapper takes the old name.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_has_online_count boolean;
  v_core_exists      boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_online_workers_count_core'
  ) INTO v_core_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace,
         unnest(coalesce(p.proargnames, '{}'::text[])) AS argname
    WHERE n.nspname = 'public'
      AND p.proname = 'get_online_workers_count'
      AND argname = 'online_count'
  ) INTO v_has_online_count;

  IF NOT v_core_exists THEN
    ALTER FUNCTION public.get_online_workers_count(text)
      RENAME TO get_online_workers_count_core;
    RAISE NOTICE 'renamed get_online_workers_count -> get_online_workers_count_core';
  END IF;

  IF v_has_online_count AND v_core_exists THEN
    RAISE NOTICE 'compat wrapper already installed; will be replaced';
  END IF;
END $$;

-- Drop any previous wrapper so the return type can change safely.
DROP FUNCTION IF EXISTS public.get_online_workers_count(text);

CREATE FUNCTION public.get_online_workers_count(p_community text)
RETURNS TABLE (
  service      text,
  online_count integer,   -- legacy field read by published app builds
  fresh_count  integer,
  stale_count  integer,
  total_count  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.service::text,
    c.fresh_count::integer   AS online_count,  -- authoritative live count
    c.fresh_count::integer,
    c.stale_count::integer,
    c.total_count::integer
  FROM public.get_online_workers_count_core(p_community) AS c;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_workers_count(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_online_workers_count_core(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1b. Ensure the per-service limit helper exists (idempotent; mirrors
--     supabase/functions/_shared/capacityRules.ts).
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

-- ---------------------------------------------------------------------------
-- 2. check_instant_supply(community): legacy signature, authoritative answer.
--    Old clients block when the returned number >= 3. So return 3 ONLY when a
--    real per-service instant cap is full, otherwise return the highest
--    per-service active count clamped to 2 (never trips the old threshold).
--    Real capacity protection is preserved: when any service is at its cap the
--    old app blocks exactly as the new build does, and the DB trigger plus the
--    check-booking-capacity edge gate still run before payment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_instant_supply(p_community text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_any_full boolean;
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
    RETURN 3;               -- legacy "supply full" signal
  END IF;

  RETURN LEAST(coalesce(v_max_active, 0), 2);
END $$;

GRANT EXECUTE ON FUNCTION public.check_instant_supply(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Sanity checks (run after commit):
--    SELECT * FROM public.get_online_workers_count('prestige-high-fields');
--      --> every row MUST contain a non-null online_count
--    SELECT public.check_instant_supply('prestige-high-fields');
--      --> 0..2 when bookable, 3 only when a per-service cap is genuinely full
-- ---------------------------------------------------------------------------

COMMIT;
