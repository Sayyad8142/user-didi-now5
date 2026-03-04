
-- RPC to return today's quick stats without fetching all rows
CREATE OR REPLACE FUNCTION public.admin_quick_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'today', COALESCE(SUM(CASE WHEN created_at >= (now() AT TIME ZONE 'Asia/Kolkata')::date::timestamptz THEN 1 ELSE 0 END), 0),
    'pending', COALESCE(SUM(CASE WHEN status = 'pending' AND created_at >= (now() AT TIME ZONE 'Asia/Kolkata')::date::timestamptz THEN 1 ELSE 0 END), 0),
    'completed', COALESCE(SUM(CASE WHEN status = 'completed' AND created_at >= (now() AT TIME ZONE 'Asia/Kolkata')::date::timestamptz THEN 1 ELSE 0 END), 0),
    'revenue', COALESCE(SUM(CASE WHEN status = 'completed' AND created_at >= (now() AT TIME ZONE 'Asia/Kolkata')::date::timestamptz THEN price_inr ELSE 0 END), 0)
  )
  FROM bookings
  WHERE created_at >= (now() AT TIME ZONE 'Asia/Kolkata')::date::timestamptz;
$$;
