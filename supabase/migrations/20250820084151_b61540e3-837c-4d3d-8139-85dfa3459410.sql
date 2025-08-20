-- Export user data as JSON (profile + bookings)
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id, full_name, phone, community, flat_no, created_at, updated_at
    FROM profiles
    WHERE id = auth.uid()
  ),
  my_bookings AS (
    SELECT id, service_type, booking_type, scheduled_date, scheduled_time,
           status, price_inr, flat_size, family_count, food_pref,
           community, flat_no, created_at, updated_at
    FROM bookings
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
  )
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(me) FROM me),
    'bookings', (SELECT COALESCE(jsonb_agg(to_jsonb(my_bookings)), '[]'::jsonb) FROM my_bookings)
  );
$$;

-- Purge user data (bookings, then profile). Leaves auth user; we remove auth in the Edge Function.
CREATE OR REPLACE FUNCTION public.delete_my_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- safety: must be logged in
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- delete dependent rows (bookings reference user_id)
  DELETE FROM bookings WHERE user_id = auth.uid();

  -- finally delete profile
  DELETE FROM profiles WHERE id = auth.uid();
END;
$$;