-- Idempotency guard: a single Razorpay payment_id can only have one orphan_payments row.
-- Razorpay retries webhooks on 5xx and on missed ACKs; without this, duplicate
-- payment.captured deliveries for a truly-orphan payment would create duplicate
-- orphan_payments rows. Backfill: keep the earliest row per payment_id.

DELETE FROM public.orphan_payments a
USING public.orphan_payments b
WHERE a.razorpay_payment_id = b.razorpay_payment_id
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orphan_payments_razorpay_payment_id
  ON public.orphan_payments (razorpay_payment_id);
