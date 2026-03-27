-- =============================================================
-- WORKER PAYOUTS TABLE MIGRATION
-- Run this on your EXTERNAL Supabase database
-- =============================================================

-- 1. Create worker_payouts table with standardized naming
CREATE TABLE IF NOT EXISTS public.worker_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  booking_amount numeric NOT NULL DEFAULT 0,
  platform_fee numeric NOT NULL DEFAULT 0,
  payout_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Unique constraint: one payout per booking+worker (idempotency guard)
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_payout_booking_worker
  ON public.worker_payouts (booking_id, worker_id);

-- 3. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_worker_payouts_worker_id ON public.worker_payouts (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_payouts_status ON public.worker_payouts (status);
CREATE INDEX IF NOT EXISTS idx_worker_payouts_created_at ON public.worker_payouts (created_at DESC);

-- 4. RLS: only service_role can manage payouts
ALTER TABLE public.worker_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on worker_payouts"
  ON public.worker_payouts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_worker_payouts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_worker_payouts_updated_at
  BEFORE UPDATE ON public.worker_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_worker_payouts_updated_at();
