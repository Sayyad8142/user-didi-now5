
CREATE OR REPLACE FUNCTION public.debit_wallet_for_booking(
  p_booking_id uuid,
  p_amount integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_balance integer;
BEGIN
  -- Get booking user
  SELECT user_id INTO v_user_id
  FROM bookings WHERE id = p_booking_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  -- Verify caller owns this booking
  IF v_user_id != get_profile_id() THEN
    RAISE EXCEPTION 'not_your_booking';
  END IF;

  -- Check balance
  SELECT balance_inr INTO v_balance
  FROM user_wallets WHERE user_id = v_user_id;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_wallet_balance';
  END IF;

  -- Debit wallet
  UPDATE user_wallets
  SET balance_inr = balance_inr - p_amount, updated_at = now()
  WHERE user_id = v_user_id;

  -- Record transaction
  INSERT INTO wallet_transactions (user_id, booking_id, amount_inr, type, reason)
  VALUES (v_user_id, p_booking_id, p_amount, 'debit', 'Booking payment from wallet');

  -- Update booking payment info
  UPDATE bookings
  SET payment_status = CASE
    WHEN p_amount >= price_inr THEN 'wallet_paid'
    ELSE 'partial_wallet'
  END,
  payment_method = CASE
    WHEN p_amount >= price_inr THEN 'wallet'
    ELSE 'wallet+razorpay'
  END,
  paid_confirmed_at = CASE
    WHEN p_amount >= price_inr THEN now()
    ELSE paid_confirmed_at
  END
  WHERE id = p_booking_id;
END;
$$;
