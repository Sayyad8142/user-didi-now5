-- ============================================================
-- Service-wise Instant Capacity (V2)
-- Apply on EXTERNAL Supabase (api.didisnow.com) ONLY.
--
-- Counts active instant bookings per (community, service_type)
-- across the statuses that actually occupy a worker slot.
-- Scheduled bookings are excluded.
--
-- Per-service limits (mirror supabase/functions/_shared/capacityRules.ts):
--   maid               : 3
--   bathroom_cleaning  : 1
--   dishwashing        : 2
--   dish_washing       : 2
--   floor_cleaning     : 3
--   default            : 3
-- ============================================================

-- 1. New service-wise counting RPC.
CREATE OR REPLACE FUNCTION public.check_instant_supply_for_service(
  p_community    text,
  p_service_type text
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM bookings
  WHERE community     = p_community
    AND service_type  = p_service_type
    AND booking_type  = 'instant'
    AND status IN (
      'pending',
      'dispatched',
      'accepted',
      'confirmed',
      'on_the_way',
      'in_progress'
    );
$$;

GRANT EXECUTE ON FUNCTION public.check_instant_supply_for_service(text, text)
  TO authenticated, service_role;

-- 2. Per-service limit lookup (single source of truth in DB).
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
  TO authenticated, service_role;

-- 3. Updated trigger: service-wise, broader active-status set.
CREATE OR REPLACE FUNCTION public.enforce_instant_supply_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  active_count integer;
  max_allowed  integer;
BEGIN
  -- Only enforce on instant inserts/updates that land in an active state.
  IF NEW.booking_type = 'instant'
     AND NEW.status IN (
       'pending', 'dispatched', 'accepted',
       'confirmed', 'on_the_way', 'in_progress'
     )
  THEN
    max_allowed := public.instant_limit_for_service(NEW.service_type);

    SELECT count(*)
      INTO active_count
      FROM bookings
     WHERE community     = NEW.community
       AND service_type  = NEW.service_type
       AND booking_type  = 'instant'
       AND id <> NEW.id
       AND status IN (
         'pending', 'dispatched', 'accepted',
         'confirmed', 'on_the_way', 'in_progress'
       );

    IF active_count >= max_allowed THEN
      RAISE EXCEPTION
        'SUPPLY_FULL: Currently all experts are busy. Please try again after 20 minutes.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Keep the legacy RPC working for any caller that still passes
--    only a community; it now uses the same broader status set so
--    the answer is consistent. Service-aware callers should switch
--    to check_instant_supply_for_service().
CREATE OR REPLACE FUNCTION public.check_instant_supply(p_community text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM bookings
  WHERE community     = p_community
    AND booking_type  = 'instant'
    AND status IN (
      'pending', 'dispatched', 'accepted',
      'confirmed', 'on_the_way', 'in_progress'
    );
$$;

GRANT EXECUTE ON FUNCTION public.check_instant_supply(text)
  TO authenticated, service_role;
