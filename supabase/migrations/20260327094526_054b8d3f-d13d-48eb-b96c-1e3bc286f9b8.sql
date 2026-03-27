
-- Table to log orphan payments (money received but no matching booking)
CREATE TABLE IF NOT EXISTS public.orphan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_payment_id text NOT NULL,
  razorpay_order_id text,
  amount_inr numeric,
  currency text DEFAULT 'INR',
  user_id uuid,
  status text NOT NULL DEFAULT 'unmapped',
  notes text,
  webhook_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);

-- RLS: only admins should access this, but allow insert from service role
ALTER TABLE public.orphan_payments ENABLE ROW LEVEL SECURITY;

-- No public access - only service role can read/write
CREATE POLICY "Service role full access on orphan_payments"
  ON public.orphan_payments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
