-- Fix security issue: Add RLS protection to worker_rating_stats table
-- This table contains worker performance data that should only be visible to admins and users who have booked those workers

-- Enable RLS on worker_rating_stats table
ALTER TABLE public.worker_rating_stats ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow admins to view all worker rating statistics
CREATE POLICY "Admins can view all worker rating stats" 
ON public.worker_rating_stats 
FOR SELECT 
USING (public.is_admin());

-- Policy 2: Allow users to view rating stats for workers they have been assigned
CREATE POLICY "Users can view stats for their assigned workers" 
ON public.worker_rating_stats 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.bookings b 
    WHERE b.worker_id = worker_rating_stats.worker_id 
      AND b.user_id = auth.uid() 
      AND b.status IN ('assigned', 'completed')
  )
);

-- Policy 3: Only admins can modify worker rating stats (these are typically computed automatically)
CREATE POLICY "Only admins can modify worker rating stats" 
ON public.worker_rating_stats 
FOR ALL 
USING (public.is_admin()) 
WITH CHECK (public.is_admin());