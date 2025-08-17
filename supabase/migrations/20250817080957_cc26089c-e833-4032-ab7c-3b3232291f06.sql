-- Create ops settings table for SLA configuration
CREATE TABLE IF NOT EXISTS public.ops_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Initialize default SLA settings
INSERT INTO public.ops_settings(key, value) VALUES
  ('pending_sla_minutes', '12'),
  ('overdue_action', 'cancel'),               -- 'cancel' or 'escalate' or 'none'
  ('escalate_webhook', '')                    -- webhook URL for escalation
ON CONFLICT (key) DO NOTHING;

-- Enable RLS - only admins can manage/read settings
ALTER TABLE public.ops_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_admin_all ON public.ops_settings;
CREATE POLICY ops_admin_all ON public.ops_settings
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Helper functions for SLA management
CREATE OR REPLACE FUNCTION public.get_setting(p_key TEXT, p_default TEXT)
RETURNS TEXT 
LANGUAGE SQL 
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE((SELECT value FROM public.ops_settings WHERE key = p_key), p_default);
$$;

CREATE OR REPLACE FUNCTION public.pending_sla_minutes()
RETURNS INTEGER 
LANGUAGE SQL 
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE((SELECT value::INT FROM public.ops_settings WHERE key = 'pending_sla_minutes'), 12);
$$;

-- Enable HTTP extension for webhook functionality
CREATE EXTENSION IF NOT EXISTS http;

-- Function to escalate overdue bookings via webhook
CREATE OR REPLACE FUNCTION public.escalate_overdue_bookings()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_url TEXT := get_setting('escalate_webhook', '');
  r RECORD;
BEGIN
  IF v_url = '' THEN RETURN; END IF;
  
  FOR r IN
    SELECT id, service_type, community, flat_no, cust_name, cust_phone, created_at
    FROM public.bookings
    WHERE status = 'pending'
      AND now() - created_at > (pending_sla_minutes() || ' minutes')::INTERVAL
  LOOP
    PERFORM http_post(
      v_url,
      json_build_object(
        'type', 'overdue_booking',
        'booking_id', r.id,
        'service', r.service_type,
        'community', r.community,
        'flat', r.flat_no,
        'customer', r.cust_name,
        'phone', r.cust_phone,
        'created_at', r.created_at
      )::TEXT,
      'application/json'
    );
  END LOOP;
END $$;

-- Main function to auto-handle overdue pending bookings
CREATE OR REPLACE FUNCTION public.auto_handle_overdue_bookings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_sla INT := pending_sla_minutes();
  v_action TEXT := get_setting('overdue_action', 'cancel');
  v_count INT := 0;
BEGIN
  -- Set note for history tracking
  PERFORM set_config('app.bsh_note', 'Auto action: SLA timeout', true);

  IF v_action = 'cancel' THEN
    UPDATE public.bookings
       SET status = 'cancelled'
     WHERE status = 'pending'
       AND now() - created_at > (v_sla || ' minutes')::INTERVAL;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF v_action = 'escalate' THEN
    PERFORM public.escalate_overdue_bookings();
    v_count := 0;
  ELSE
    v_count := 0;
  END IF;

  -- Clear the session variable
  PERFORM set_config('app.bsh_note', '', true);
  
  RETURN v_count;
END $$;

-- Schedule the function to run every minute using pg_cron
SELECT cron.schedule(
  'didinow_sla_overdue',
  '* * * * *',
  $$SELECT public.auto_handle_overdue_bookings();$$
);