-- Enable extensions if not already
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS http;

-- 1) Public storage bucket for worker photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('worker-photos', 'worker-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2) Workers table
CREATE TABLE IF NOT EXISTS public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL UNIQUE,
  upi_id text NOT NULL,
  photo_url text,
  service_types text[] NOT NULL DEFAULT '{}'::text[],
  community text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workers_name ON public.workers USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_workers_phone ON public.workers (phone);
CREATE INDEX IF NOT EXISTS idx_workers_active ON public.workers (is_active);

-- 3) Add worker columns on bookings for denormalized read
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS worker_name text,
  ADD COLUMN IF NOT EXISTS worker_phone text,
  ADD COLUMN IF NOT EXISTS worker_upi text,
  ADD COLUMN IF NOT EXISTS worker_photo_url text;

-- 4) RLS: admins manage workers
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workers_admin_all ON public.workers;
CREATE POLICY workers_admin_all ON public.workers
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Allow users to view assigned workers
DROP POLICY IF EXISTS users_can_view_assigned_workers ON public.workers;
CREATE POLICY users_can_view_assigned_workers ON public.workers
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM assignments a 
    JOIN bookings b ON a.booking_id = b.id 
    WHERE a.worker_id = workers.id AND b.user_id = auth.uid()
  )
);

-- 5) When a worker is assigned to a booking, copy worker fields to booking
CREATE OR REPLACE FUNCTION public.copy_worker_into_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  w public.workers;
BEGIN
  IF NEW.worker_id IS NULL THEN
    -- clear if unassigned
    NEW.worker_name := NULL; 
    NEW.worker_phone := NULL; 
    NEW.worker_upi := NULL; 
    NEW.worker_photo_url := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO w FROM public.workers WHERE id = NEW.worker_id;
  IF FOUND THEN
    NEW.worker_name := w.full_name;
    NEW.worker_phone := w.phone;
    NEW.worker_upi := w.upi_id;
    NEW.worker_photo_url := w.photo_url;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_copy_worker ON public.bookings;
CREATE TRIGGER trg_booking_copy_worker
BEFORE UPDATE OF worker_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.copy_worker_into_booking();

-- 6) RPC to assign worker (sets status=assigned + stamps fields + assigned_at)
CREATE OR REPLACE FUNCTION public.assign_worker_to_booking(p_booking_id uuid, p_worker_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bookings b
  SET worker_id = p_worker_id,
      status = 'assigned',
      assigned_at = COALESCE(assigned_at, now())
  WHERE b.id = p_booking_id;
END $$;

-- Storage policies for worker photos
CREATE POLICY "Worker photos are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'worker-photos');

CREATE POLICY "Admins can upload worker photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'worker-photos' AND public.is_admin());

CREATE POLICY "Admins can update worker photos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'worker-photos' AND public.is_admin());