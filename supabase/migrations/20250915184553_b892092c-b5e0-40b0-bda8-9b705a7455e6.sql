-- Enable Row Level Security on booking_assignments table
ALTER TABLE public.booking_assignments ENABLE ROW LEVEL SECURITY;

-- Admin policies for booking_assignments
CREATE POLICY "booking_assignments_admin_all" 
ON public.booking_assignments 
FOR ALL 
USING (is_admin()) 
WITH CHECK (is_admin());

-- Workers can view assignments where they are the assigned worker
CREATE POLICY "booking_assignments_worker_select" 
ON public.booking_assignments 
FOR SELECT 
USING (worker_id = auth.uid());

-- Workers can update their own assignment status (accept/decline)
CREATE POLICY "booking_assignments_worker_update" 
ON public.booking_assignments 
FOR UPDATE 
USING (worker_id = auth.uid()) 
WITH CHECK (worker_id = auth.uid());

-- Users can view assignments for their bookings
CREATE POLICY "booking_assignments_user_select" 
ON public.booking_assignments 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM bookings b 
  WHERE b.id = booking_assignments.booking_id 
  AND b.user_id = auth.uid()
));

-- Enable Row Level Security on notification_logs table
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Admin policies for notification_logs
CREATE POLICY "notification_logs_admin_all" 
ON public.notification_logs 
FOR ALL 
USING (is_admin()) 
WITH CHECK (is_admin());

-- Workers can view their own notifications only
CREATE POLICY "notification_logs_worker_select" 
ON public.notification_logs 
FOR SELECT 
USING (worker_id = auth.uid());