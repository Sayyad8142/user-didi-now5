-- Drop existing tables to recreate with new schema
DROP TABLE IF EXISTS public.assignments CASCADE;
DROP TABLE IF EXISTS public.workers CASCADE;

-- Create workers table with new structure
CREATE TABLE IF NOT EXISTS public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_types TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'maid','cook'}
  community TEXT,        -- optional scope
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create assignments table with new structure
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'assigned',  -- 'assigned','enroute','arrived','completed','rejected'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Workers policies: admins can do anything
DROP POLICY IF EXISTS workers_admin_all ON public.workers;
CREATE POLICY workers_admin_all ON public.workers
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Assignments policies: admins can do anything
DROP POLICY IF EXISTS assignments_admin_all ON public.assignments;
CREATE POLICY assignments_admin_all ON public.assignments
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Allow users to read assignment of their own bookings
DROP POLICY IF EXISTS assignments_user_read_own ON public.assignments;
CREATE POLICY assignments_user_read_own ON public.assignments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = public.assignments.booking_id
      AND b.user_id = auth.uid()
  )
);

-- Add updated_at trigger for assignments
CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample workers with new structure
INSERT INTO public.workers (full_name, phone, service_types, community) VALUES
('Priya Sharma', '+919876543210', ARRAY['cook'], 'Brigade Cosmopolis'),
('Ravi Kumar', '+919876543211', ARRAY['maid'], 'Prestige Lakeside'),
('Anita Singh', '+919876543212', ARRAY['maid', 'cook'], NULL),
('Suresh Patel', '+919876543213', ARRAY['cook'], 'Brigade Cosmopolis'),
('Meera Yadav', '+919876543214', ARRAY['maid'], 'Prestige Lakeside'),
('Lakshmi Devi', '+919876543215', ARRAY['maid', 'cook'], 'Embassy Lake'),
('Ramesh Gupta', '+919876543216', ARRAY['cook'], NULL);