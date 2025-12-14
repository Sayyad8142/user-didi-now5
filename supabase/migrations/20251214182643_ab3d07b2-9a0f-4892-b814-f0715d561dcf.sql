-- Drop conflicting policies that block operations or compare Firebase UID to UUIDs
DROP POLICY IF EXISTS "bookings_deny_anonymous_all" ON public.bookings;
DROP POLICY IF EXISTS "Allow public read access to bookings" ON public.bookings;
DROP POLICY IF EXISTS "Allow public update access to bookings" ON public.bookings;
DROP POLICY IF EXISTS "bookings assigned update" ON public.bookings;
DROP POLICY IF EXISTS "workers_can_see_assigned_bookings" ON public.bookings;
DROP POLICY IF EXISTS "workers_can_see_matching_pending_bookings" ON public.bookings;
DROP POLICY IF EXISTS "workers_can_see_relevant_bookings" ON public.bookings;

-- Keep the firebase-based policies for users:
-- bookings_select_own_firebase, bookings_insert_own_firebase, bookings_update_own_firebase
-- bookings_select_admin_authenticated_only, bookings_update_admin_authenticated_only

-- For worker access, they use their own worker app with different auth
-- We'll create worker policies that check workers.user_id column instead

-- Create worker policies that work with Firebase auth through workers.user_id
CREATE POLICY "bookings_worker_select_assigned" 
ON public.bookings 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM workers w 
  WHERE w.id = bookings.worker_id 
  AND w.user_id IS NOT NULL
  AND w.user_id::text = auth.uid()::text
));

CREATE POLICY "bookings_worker_update_assigned" 
ON public.bookings 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM workers w 
  WHERE w.id = bookings.worker_id 
  AND w.user_id IS NOT NULL
  AND w.user_id::text = auth.uid()::text
))
WITH CHECK (EXISTS (
  SELECT 1 FROM workers w 
  WHERE w.id = bookings.worker_id 
  AND w.user_id IS NOT NULL
  AND w.user_id::text = auth.uid()::text
));