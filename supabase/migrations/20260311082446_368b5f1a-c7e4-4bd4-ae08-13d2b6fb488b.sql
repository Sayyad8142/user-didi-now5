
-- Create user_wallets table
CREATE TABLE public.user_wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_inr integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_wallets_select_own" ON public.user_wallets
  FOR SELECT TO public
  USING (user_id = get_profile_id());

CREATE POLICY "user_wallets_admin_all" ON public.user_wallets
  FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());

-- Create wallet_transactions table
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id),
  amount_inr integer NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_transactions_select_own" ON public.wallet_transactions
  FOR SELECT TO public
  USING (user_id = get_profile_id());

CREATE POLICY "wallet_transactions_admin_all" ON public.wallet_transactions
  FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());

-- Function to credit wallet on cancellation of paid booking
CREATE OR REPLACE FUNCTION public.credit_wallet_on_cancel(
  p_booking_id uuid,
  p_reason text DEFAULT 'Booking cancelled - refund to wallet'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_price integer;
  v_payment_status text;
BEGIN
  -- Get booking details
  SELECT user_id, price_inr, payment_status
  INTO v_user_id, v_price, v_payment_status
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  -- Only refund if payment was actually made
  IF v_payment_status NOT IN ('paid', 'wallet_paid', 'partial_wallet') THEN
    RETURN; -- nothing to refund
  END IF;

  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN;
  END IF;

  -- Upsert wallet balance
  INSERT INTO user_wallets (user_id, balance_inr, updated_at)
  VALUES (v_user_id, v_price, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance_inr = user_wallets.balance_inr + EXCLUDED.balance_inr,
    updated_at = now();

  -- Insert transaction record
  INSERT INTO wallet_transactions (user_id, booking_id, amount_inr, type, reason)
  VALUES (v_user_id, p_booking_id, v_price, 'credit', p_reason);

  -- Update booking payment status
  UPDATE bookings
  SET payment_status = 'refunded_to_wallet'
  WHERE id = p_booking_id;
END;
$$;
