-- Create workers table
CREATE TABLE public.workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_type TEXT NOT NULL, -- 'cook', 'maid', or 'both'
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create assignments table
CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned',
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(booking_id, worker_id)
);

-- Enable RLS
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Workers policies (admin can manage, everyone can read available workers)
CREATE POLICY "workers_admin_all" ON public.workers
FOR ALL USING (public.is_admin());

CREATE POLICY "workers_read_available" ON public.workers
FOR SELECT USING (is_available = true);

-- Assignments policies (admin can manage all)
CREATE POLICY "assignments_admin_all" ON public.assignments
FOR ALL USING (public.is_admin());

-- Add updated_at triggers
CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample workers
INSERT INTO public.workers (name, phone, service_type) VALUES
('Priya Sharma', '+919876543210', 'cook'),
('Ravi Kumar', '+919876543211', 'maid'),
('Anita Singh', '+919876543212', 'both'),
('Suresh Patel', '+919876543213', 'cook'),
('Meera Yadav', '+919876543214', 'maid');