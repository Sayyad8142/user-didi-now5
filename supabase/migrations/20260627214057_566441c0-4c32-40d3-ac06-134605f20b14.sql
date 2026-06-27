CREATE TABLE public.favorite_worker_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  booking_id uuid,
  worker_id uuid,
  requested_preferred_worker_id uuid,
  event_name text NOT NULL,
  service_type text,
  community text,
  fallback_latency_ms integer,
  request_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fwe_event_name_created_at ON public.favorite_worker_events (event_name, created_at DESC);
CREATE INDEX idx_fwe_booking_id ON public.favorite_worker_events (booking_id);
CREATE INDEX idx_fwe_worker_id ON public.favorite_worker_events (requested_preferred_worker_id);
CREATE INDEX idx_fwe_request_id ON public.favorite_worker_events (request_id);

GRANT INSERT ON public.favorite_worker_events TO authenticated, anon;
GRANT ALL ON public.favorite_worker_events TO service_role;

ALTER TABLE public.favorite_worker_events ENABLE ROW LEVEL SECURITY;

-- Allow inserts from any client (events are append-only analytics); reads restricted to service role
CREATE POLICY "Anyone can insert favorite worker events"
  ON public.favorite_worker_events
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Service role full access"
  ON public.favorite_worker_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);