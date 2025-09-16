-- Indexes for performance
CREATE INDEX IF NOT EXISTS workers_status_idx ON workers(is_available);
CREATE INDEX IF NOT EXISTS workers_community_idx ON workers(community);
CREATE INDEX IF NOT EXISTS workers_services_gin ON workers USING gin(service_types);
CREATE INDEX IF NOT EXISTS workers_name_trgm ON workers USING gin(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS workers_phone_idx ON workers(phone);

CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_worker_idx ON bookings(worker_id);

-- Audit table for booking events
CREATE TABLE IF NOT EXISTS booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on booking_events
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;

-- Admin can manage all booking events
CREATE POLICY "booking_events_admin_all" ON booking_events
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Users can view events for their own bookings
CREATE POLICY "booking_events_user_own" ON booking_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bookings b 
      WHERE b.id = booking_events.booking_id 
      AND b.user_id = auth.uid()
    )
  );

-- RPC: Atomic assign with race checks and audit trail
CREATE OR REPLACE FUNCTION public.assign_worker_to_booking(p_booking_id uuid, p_worker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean := is_admin();
  v_booking bookings%rowtype;
  v_worker workers%rowtype;
  v_minutes int;
BEGIN
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied (admin only)' USING ERRCODE = '42501';
  END IF;

  -- Lock rows to avoid races
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  IF v_booking.status = 'assigned' THEN
    RETURN jsonb_build_object('status', 'already_assigned', 'worker_id', v_booking.worker_id);
  END IF;

  SELECT * INTO v_worker FROM workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION 'Worker not found';
  END IF;
  
  IF NOT v_worker.is_available OR NOT v_worker.is_active THEN
    RETURN jsonb_build_object('status', 'worker_busy');
  END IF;

  -- Get auto-complete minutes with fallback
  v_minutes := get_setting_int('auto_complete_after_minutes.' || v_booking.service_type, 45);

  -- Update booking with worker details
  UPDATE bookings SET
    worker_id = p_worker_id,
    worker_name = v_worker.full_name,
    worker_phone = v_worker.phone,
    worker_upi = v_worker.upi_id,
    worker_photo_url = v_worker.photo_url,
    status = 'assigned',
    assigned_at = COALESCE(assigned_at, now()),
    pay_enabled_at = COALESCE(pay_enabled_at, now() + interval '30 minutes'),
    auto_complete_after_minutes = v_minutes,
    auto_complete_at = now() + (v_minutes || ' minutes')::interval,
    updated_at = now()
  WHERE id = p_booking_id;

  -- Mark worker as unavailable
  UPDATE workers SET 
    is_available = false,
    last_active_at = now(),
    updated_at = now()
  WHERE id = p_worker_id;

  -- Log the assignment event
  INSERT INTO booking_events(booking_id, type, meta)
  VALUES (p_booking_id, 'worker_assigned', jsonb_build_object(
    'assigned_by', auth.uid(),
    'worker_id', p_worker_id,
    'worker_name', v_worker.full_name,
    'assignment_method', 'manual'
  ));

  RETURN jsonb_build_object('status', 'ok', 'worker_id', p_worker_id);
END;
$$;

-- Grant execute permission to authenticated users (admin check is inside function)
REVOKE ALL ON FUNCTION public.assign_worker_to_booking(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_worker_to_booking(uuid, uuid) TO authenticated;