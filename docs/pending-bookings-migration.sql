-- ============================================================
-- pending_bookings — payment-first booking recovery
-- ============================================================
-- Run on EXTERNAL Supabase (api.didisnow.com / paywwbuqycovjopryele)
-- where `bookings` and `profiles` live.
--
-- Purpose:
--   Stash the full booking payload server-side BEFORE the
--   Razorpay overlay opens. The webhook + reconciliation cron
--   can then create the booking even if the frontend dies
--   after the user finishes paying.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pending_bookings (
  razorpay_order_id text PRIMARY KEY,
  user_id           uuid NOT NULL,
  request_id        uuid NOT NULL,
  booking_data      jsonb NOT NULL,
  payment_type      text NOT NULL,
  wallet_amount     numeric DEFAULT 0,
  amount_inr        numeric NOT NULL,
  status            text NOT NULL DEFAULT 'awaiting_payment',
  -- 'awaiting_payment' | 'consumed' | 'expired' | 'manual_review'
  created_at        timestamptz NOT NULL DEFAULT now(),
  consumed_at       timestamptz,
  booking_id        uuid,
  last_error        text,
  last_checked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS ix_pending_bookings_status_created
  ON public.pending_bookings (status, created_at);

CREATE INDEX IF NOT EXISTS ix_pending_bookings_request_id
  ON public.pending_bookings (request_id);

CREATE INDEX IF NOT EXISTS ix_pending_bookings_user_id
  ON public.pending_bookings (user_id);

-- RLS: service role only (edge functions use service role).
ALTER TABLE public.pending_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access on pending_bookings"
  ON public.pending_bookings;

CREATE POLICY "service role full access on pending_bookings"
  ON public.pending_bookings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Cron for reconciliation (run on Lovable Cloud via pg_cron + pg_net)
-- ============================================================
-- The reconcile-pending-bookings edge function is deployed on
-- Lovable Cloud. Schedule the cron from the LOVABLE CLOUD database
-- (not this external DB) — use the project's existing pattern:
--
--   select cron.schedule(
--     'reconcile-pending-bookings-2min',
--     '*/2 * * * *',
--     $$
--       select net.http_post(
--         url:='https://wvuuyrovdfydubmvsfxl.supabase.co/functions/v1/reconcile-pending-bookings',
--         headers:=jsonb_build_object(
--           'Content-Type','application/json',
--           'apikey','<LOVABLE_CLOUD_ANON_KEY>'
--         ),
--         body:=jsonb_build_object('source','cron')
--       );
--     $$
--   );
--
-- (Lovable will create this cron via supabase.insert in a separate step.)
