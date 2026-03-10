
CREATE OR REPLACE FUNCTION public.get_favorite_workers(p_service text, p_community text, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  worker_id uuid,
  full_name text,
  photo_url text,
  rating_avg numeric,
  rating_count integer,
  completed_bookings_count integer,
  is_online boolean,
  last_seen_at timestamptz,
  last_booking_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH resolved_user AS (
    SELECT COALESCE(
      p_user_id,
      (SELECT id FROM profiles WHERE firebase_uid = auth.uid()::text LIMIT 1)
    ) AS uid
  ),
  fav_workers AS (
    SELECT
      b.worker_id,
      MAX(b.created_at) AS last_booking_at
    FROM bookings b, resolved_user ru
    WHERE b.user_id = ru.uid
      AND b.worker_id IS NOT NULL
      AND b.community = p_community
      AND b.service_type = p_service
      AND b.status IN ('completed','started','on_the_way','assigned','accepted')
    GROUP BY b.worker_id
  )
  SELECT
    w.id AS worker_id,
    w.full_name,
    w.photo_url,
    COALESCE(w.rating, 0)::numeric AS rating_avg,
    COALESCE(w.total_ratings, 0)::integer AS rating_count,
    COALESCE(w.total_bookings_completed, 0)::integer AS completed_bookings_count,
    COALESCE(w.is_available, false) AS is_online,
    w.last_seen_at,
    fw.last_booking_at
  FROM fav_workers fw
  JOIN workers w ON w.id = fw.worker_id
  WHERE w.is_active = true
  ORDER BY fw.last_booking_at DESC;
$$;
