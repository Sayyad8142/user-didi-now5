
-- Add missing columns to payment_intents
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_payment_intents_status_created
  ON public.payment_intents (status, created_at);
