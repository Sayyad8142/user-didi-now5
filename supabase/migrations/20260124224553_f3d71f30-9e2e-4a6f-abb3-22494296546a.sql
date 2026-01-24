-- Fix worker rating persistence for Firebase-only users.
-- Current UI inserts silently fail because Supabase Auth session is usually null.
-- We allow public read/insert/update of worker_ratings, constrained to matching booking ownership (worker_ratings.user_id must equal bookings.user_id).

BEGIN;

-- Ensure RLS is enabled (should already be)
ALTER TABLE public.worker_ratings ENABLE ROW LEVEL SECURITY;

-- Replace restrictive customer policies
DROP POLICY IF EXISTS wr_select ON public.worker_ratings;
DROP POLICY IF EXISTS wr_insert ON public.worker_ratings;

-- Public read: needed for showing user's rating after refresh and for worker ratings modal
CREATE POLICY worker_ratings_public_read
ON public.worker_ratings
FOR SELECT
TO public
USING (true);

-- Public insert: only allow inserting a rating for a booking if the rating row's user_id matches the booking owner.
CREATE POLICY worker_ratings_public_insert_matching_booking
ON public.worker_ratings
FOR INSERT
TO public
WITH CHECK (
  worker_ratings.rating BETWEEN 1 AND 5
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = worker_ratings.booking_id
      AND b.user_id = worker_ratings.user_id
      AND (worker_ratings.worker_id IS NULL OR b.worker_id = worker_ratings.worker_id)
  )
);

-- Public update: required for UPSERT/edit; keep the same constraint.
CREATE POLICY worker_ratings_public_update_matching_booking
ON public.worker_ratings
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = worker_ratings.booking_id
      AND b.user_id = worker_ratings.user_id
      AND (worker_ratings.worker_id IS NULL OR b.worker_id = worker_ratings.worker_id)
  )
)
WITH CHECK (
  worker_ratings.rating BETWEEN 1 AND 5
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = worker_ratings.booking_id
      AND b.user_id = worker_ratings.user_id
      AND (worker_ratings.worker_id IS NULL OR b.worker_id = worker_ratings.worker_id)
  )
);

COMMIT;
