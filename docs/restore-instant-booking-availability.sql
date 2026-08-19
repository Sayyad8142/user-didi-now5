-- ============================================================================
-- RESTORE INSTANT BOOKING AVAILABILITY (Heartbeat Relaxation)
-- Run on EXTERNAL Supabase (api.didisnow.com)
-- ============================================================================

-- 1. Refactor get_online_workers_count to separate Fresh vs Dispatchable
CREATE OR REPLACE FUNCTION public.get_online_workers_count(p_community text)
RETURNS TABLE(service text, online_count bigint, candidate_count bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now() AT TIME ZONE 'Asia/Kolkata';
  v_dow int := EXTRACT(DOW FROM v_now)::int;
  v_current_slot text := to_char(
    date_trunc('hour', v_now::time) + 
    (floor(EXTRACT(MINUTE FROM v_now::time) / 30) * interval '30 minutes'),
    'HH24:MI:SS'
  );
BEGIN
  RETURN QUERY
  SELECT 
    svc AS service,
    -- Fresh/Online: Heartbeat within 3 minutes
    count(DISTINCT w.id) FILTER (WHERE w.last_seen_at >= (now() - interval '3 minutes')) AS online_count,
    -- Dispatch Candidates: Heartbeat within 30 minutes + other flags
    count(DISTINCT w.id) AS candidate_count
  FROM workers w
  CROSS JOIN unnest(w.service_types) AS svc
  INNER JOIN worker_availability wa 
    ON wa.worker_id = w.id 
    AND wa.day_of_week = v_dow
    AND v_current_slot = ANY(wa.slots)
  WHERE (w.communities IS NULL OR array_length(w.communities, 1) IS NULL OR p_community = ANY(w.communities))
    AND w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
    -- Relax hard filter to 30 minutes for the base query
    AND w.last_seen_at >= (now() - interval '30 minutes')
  GROUP BY svc;
END;
$$;

-- 2. Update get_eligible_workers to prioritize fresh workers but include stale candidates
CREATE OR REPLACE FUNCTION public.get_eligible_workers(
  p_service text,
  p_community text,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  worker_id uuid,
  full_name text,
  photo_url text,
  rating_avg numeric,
  rating_count int,
  completed_bookings_count int,
  last_seen_at timestamptz,
  is_fresh boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dow int;
  v_slot text;
BEGIN
  v_dow := extract(dow from now() AT TIME ZONE 'Asia/Kolkata')::int;
  v_slot := to_char(
    date_trunc('hour', now() AT TIME ZONE 'Asia/Kolkata') + 
    interval '30 min' * floor(extract(minute from now() AT TIME ZONE 'Asia/Kolkata') / 30),
    'HH24:MI:SS'
  );

  RETURN QUERY
  SELECT
    w.id AS worker_id,
    w.full_name,
    w.photo_url,
    COALESCE(w.rating, 5.0) AS rating_avg,
    COALESCE(w.total_ratings, 0)::int AS rating_count,
    COALESCE(w.total_bookings_completed, 0)::int AS completed_bookings_count,
    w.last_seen_at,
    (w.last_seen_at >= (now() - interval '3 minutes')) AS is_fresh
  FROM workers w
  JOIN worker_availability wa ON wa.worker_id = w.id
  WHERE w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
    AND p_service = ANY(w.service_types)
    AND (
      w.communities IS NULL
      OR array_length(w.communities, 1) IS NULL
      OR p_community = ANY(w.communities)
    )
    AND wa.day_of_week = v_dow
    AND v_slot = ANY(wa.slots)
    -- Hard limit relaxed to 30 minutes
    AND w.last_seen_at >= (now() - interval '30 minutes')
  ORDER BY
    (w.last_seen_at >= (now() - interval '3 minutes')) DESC, -- Fresh first
    COALESCE(w.rating, 5.0) DESC,
    COALESCE(w.total_bookings_completed, 0) DESC,
    w.last_seen_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_workers_count(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_eligible_workers(text, text, int) TO anon, authenticated, service_role;
