CREATE TABLE IF NOT EXISTS public.service_area_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid,
  phone text,
  requested_area text NOT NULL,
  normalized_area text NOT NULL,
  search_text text,
  status text NOT NULL DEFAULT 'New',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_area_requests_profile_area_uidx
  ON public.service_area_requests (profile_id, normalized_area)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_area_requests_phone_area_uidx
  ON public.service_area_requests (phone, normalized_area)
  WHERE profile_id IS NULL AND phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_area_requests_created_at_idx
  ON public.service_area_requests (created_at DESC);

GRANT ALL ON public.service_area_requests TO service_role;

ALTER TABLE public.service_area_requests ENABLE ROW LEVEL SECURITY;