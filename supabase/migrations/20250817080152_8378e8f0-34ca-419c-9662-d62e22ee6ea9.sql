-- 1) Workers table
CREATE TABLE IF NOT EXISTS public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_types TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'maid','cook'}
  community TEXT,                              -- optional preferred area
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Assignments table
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'assigned',     -- assigned,enroute,arrived,completed,rejected
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Updated_at trigger for assignments
DROP TRIGGER IF EXISTS trg_assignments_touch ON public.assignments;
CREATE TRIGGER trg_assignments_touch
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) RLS policies
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Admins can do anything with workers
DROP POLICY IF EXISTS workers_admin_all ON public.workers;
CREATE POLICY workers_admin_all ON public.workers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Admins can do anything with assignments
DROP POLICY IF EXISTS assignments_admin_all ON public.assignments;
CREATE POLICY assignments_admin_all ON public.assignments
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Users can read assignments tied to their bookings
DROP POLICY IF EXISTS assignments_user_read_own ON public.assignments;
CREATE POLICY assignments_user_read_own ON public.assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = assignments.booking_id
        AND b.user_id = auth.uid()
    )
  );

-- 5) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workers_active_service ON public.workers(is_active, service_types);
CREATE INDEX IF NOT EXISTS idx_assignments_booking_created ON public.assignments(booking_id, created_at DESC);

-- 6) Seed some workers for testing
INSERT INTO public.workers (full_name, phone, service_types, community)
VALUES
  ('Rani Sharma', '+919999000001', '{maid}', 'Gurgaon'),
  ('Suresh Kumar', '+919999000002', '{cook}', 'Delhi'),
  ('Asha Devi', '+919999000003', '{bathroom_cleaning}', 'Noida'),
  ('Ramesh Singh', '+919999000004', '{maid,cook}', 'Gurgaon'),
  ('Priya Kumari', '+919999000005', '{maid}', 'Delhi')
ON CONFLICT DO NOTHING;