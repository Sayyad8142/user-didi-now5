-- Enable Row Level Security on expert_schedules table
ALTER TABLE public.expert_schedules ENABLE ROW LEVEL SECURITY;

-- Create policy for experts to manage their own schedules
CREATE POLICY "experts_manage_own_schedules" ON public.expert_schedules
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.experts e 
        WHERE e.id = expert_schedules.expert_id 
        AND e.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.experts e 
        WHERE e.id = expert_schedules.expert_id 
        AND e.user_id = auth.uid()
    )
);

-- Create policy for admins to view and manage all schedules
CREATE POLICY "admins_manage_all_schedules" ON public.expert_schedules
FOR ALL USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Create policy for authenticated users to view active expert schedules
CREATE POLICY "users_view_active_schedules" ON public.expert_schedules
FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND is_active = true
);