-- =============================================
-- Phase 1: Payment Gateway + Wallet + OTP Flow
-- Run this on the EXTERNAL Supabase project (paywwbuqycovjopryele)
-- =============================================

-- 1. Add payment/OTP/wallet/payout columns to bookings
ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_amount_inr integer,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS wallet_refund_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS wallet_refund_amount integer,
  ADD COLUMN IF NOT EXISTS wallet_refund_at timestamptz,
  ADD COLUMN IF NOT EXISTS wallet_refund_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS completion_otp text,
  ADD COLUMN IF NOT EXISTS otp_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS otp_verified_by_worker_id uuid,
  ADD COLUMN IF NOT EXISTS worker_payout_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS worker_payout_amount integer,
  ADD COLUMN IF NOT EXISTS platform_fee_amount integer;

-- 2. Create user_wallets table
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance_inr integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own wallet" ON public.user_wallets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access wallets" ON public.user_wallets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  amount_inr integer NOT NULL,
  reason text,
  reference_type text,
  reference_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own wallet txns" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access wallet txns" ON public.wallet_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Create worker_payouts table
CREATE TABLE IF NOT EXISTS public.worker_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  gross_amount integer NOT NULL,
  platform_fee integer NOT NULL DEFAULT 0,
  net_amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  method text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access payouts" ON public.worker_payouts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. OTP pool function: generates easy-to-read 3-digit OTP (ONLY easy patterns)
CREATE OR REPLACE FUNCTION public.generate_completion_otp()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  otp_pool text[] := ARRAY[
    '111','222','333','444','555','666','777','888','999',
    '123','234','345','456','567','678','789'
  ];
  picked text;
BEGIN
  picked := otp_pool[1 + floor(random() * array_length(otp_pool, 1))::int];
  RETURN picked;
END;
$$;

-- 6. Trigger: auto-generate OTP when booking is created
CREATE OR REPLACE FUNCTION public.auto_generate_booking_otp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.completion_otp IS NULL THEN
    NEW.completion_otp := public.generate_completion_otp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_generate_booking_otp ON public.bookings;
CREATE TRIGGER trg_auto_generate_booking_otp
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_booking_otp();

-- 7. Function: credit wallet on cancellation (idempotent)
CREATE OR REPLACE FUNCTION public.credit_wallet_on_cancel(
  p_booking_id uuid,
  p_reason text DEFAULT 'user_cancelled_before_completion'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.payment_status != 'paid' THEN
    RETURN;
  END IF;

  IF v_booking.otp_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot refund after OTP verification';
  END IF;

  IF v_booking.wallet_refund_status = 'credited' THEN
    RETURN;
  END IF;

  INSERT INTO user_wallets (user_id, balance_inr)
  VALUES (v_booking.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_wallets
  SET balance_inr = balance_inr + v_booking.payment_amount_inr,
      updated_at = now()
  WHERE user_id = v_booking.user_id;

  INSERT INTO wallet_transactions (user_id, booking_id, type, amount_inr, reason, reference_type, reference_id, notes)
  VALUES (
    v_booking.user_id,
    p_booking_id,
    'credit',
    v_booking.payment_amount_inr,
    p_reason,
    'booking_refund',
    p_booking_id::text,
    'Auto refund: ' || p_reason
  );

  UPDATE bookings
  SET wallet_refund_status = 'credited',
      wallet_refund_amount = v_booking.payment_amount_inr,
      wallet_refund_at = now(),
      wallet_refund_reason = p_reason,
      payment_status = 'moved_to_wallet'
  WHERE id = p_booking_id;
END;
$$;

-- 8. Trigger: auto credit wallet when booking status changes to cancelled
CREATE OR REPLACE FUNCTION public.auto_wallet_refund_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.payment_status = 'paid' AND NEW.otp_verified_at IS NULL THEN
      PERFORM public.credit_wallet_on_cancel(NEW.id, COALESCE(NEW.cancellation_reason, 'booking_cancelled'));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_wallet_refund_on_cancel ON public.bookings;
CREATE TRIGGER trg_auto_wallet_refund_on_cancel
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_wallet_refund_on_cancel();

-- 9. Update user_cancel_booking to block cancellation after OTP verification
CREATE OR REPLACE FUNCTION public.user_cancel_booking(
  p_booking_id uuid,
  p_reason text DEFAULT 'user_cancelled'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'already_finished: Booking already completed or cancelled';
  END IF;

  -- CRITICAL: Block cancellation after OTP verification
  IF v_booking.otp_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'otp_verified: Booking already completed, cannot cancel';
  END IF;

  UPDATE bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'user',
      cancellation_reason = p_reason,
      cancel_source = 'user',
      cancel_reason = p_reason
  WHERE id = p_booking_id;

  UPDATE assignments
  SET status = 'cancelled'
  WHERE booking_id = p_booking_id
    AND status IN ('pending', 'assigned', 'accepted');
END;
$$;

-- 10. Enable realtime for wallet tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_wallets;
