-- Fix workers table RLS to allow users to see worker info only for their assigned bookings
-- This prevents public access while allowing legitimate use cases

CREATE POLICY "users_can_view_assigned_workers" 
ON public.workers 
FOR SELECT 
TO authenticated
USING (
  -- User can see worker info only if that worker is assigned to their booking
  EXISTS (
    SELECT 1 
    FROM public.assignments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE a.worker_id = workers.id
      AND b.user_id = auth.uid()
  )
);