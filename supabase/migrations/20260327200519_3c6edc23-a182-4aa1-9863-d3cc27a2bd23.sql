CREATE TABLE public.otp_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, worker_id)
);

ALTER TABLE public.otp_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on otp_attempts"
ON public.otp_attempts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);