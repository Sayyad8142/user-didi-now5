-- ===========================================================================
-- "Request Didi Now in Your Area" — coverage requests raised from signup Step 2
-- Run this on the EXTERNAL production database (api.didisnow.com).
-- Safe to re-run.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.service_area_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone           text,
  requested_area  text NOT NULL,
  normalized_area text NOT NULL,
  search_text     text,
  status          text NOT NULL DEFAULT 'New',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Duplicate protection: same requester + same normalized area = one row.
CREATE UNIQUE INDEX IF NOT EXISTS service_area_requests_profile_area_uidx
  ON public.service_area_requests (profile_id, normalized_area)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_area_requests_phone_area_uidx
  ON public.service_area_requests (phone, normalized_area)
  WHERE profile_id IS NULL AND phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_area_requests_created_at_idx
  ON public.service_area_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS service_area_requests_status_idx
  ON public.service_area_requests (status);

-- Data API grants: written/read only by the service role (edge function + Admin).
GRANT ALL ON public.service_area_requests TO service_role;

ALTER TABLE public.service_area_requests ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies on purpose: all access goes through the
-- service role (submit-area-request edge function and the Admin Panel).

-- ---------------------------------------------------------------------------
-- Admin Panel query
-- ---------------------------------------------------------------------------
-- SELECT r.id, r.requested_area, r.search_text, r.phone, r.status, r.created_at,
--        p.full_name
--   FROM public.service_area_requests r
--   LEFT JOIN public.profiles p ON p.id = r.profile_id
--  ORDER BY r.created_at DESC;
--
-- Demand ranking:
-- SELECT normalized_area, count(*) AS requests, max(created_at) AS latest
--   FROM public.service_area_requests
--  GROUP BY normalized_area
--  ORDER BY requests DESC;
