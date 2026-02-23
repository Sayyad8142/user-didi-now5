
CREATE OR REPLACE FUNCTION public.get_eligible_workers(p_service text, p_community text, p_limit int DEFAULT 50)
RETURNS TABLE(
  worker_id uuid,
  full_name text,
  photo_url text,
  rating_avg numeric,
  rating_count int,
  completed_bookings_count int,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    w.last_seen_at
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
  ORDER BY
    COALESCE(w.rating, 5.0) DESC,
    COALESCE(w.total_bookings_completed, 0) DESC,
    w.last_seen_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
