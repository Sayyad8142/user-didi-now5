-- =============================================================
-- ATOMIC WALLET DEBIT MIGRATION
-- Run this on your EXTERNAL Supabase database
-- =============================================================

-- 1. Add tracking columns to bookings (if not already present)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS wallet_used_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS razorpay_paid_amount numeric DEFAULT NULL;

-- 2. Unique partial index: prevents double wallet debit per booking
--    This is a hard DB-level guard against race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_debit_per_booking
  ON public.wallet_transactions (booking_id, type, reason)
  WHERE type = 'debit' AND reason = 'booking_payment';

-- 3. Fully atomic, idempotent RPC
--    All money logic happens inside ONE DB transaction with row locks.
CREATE OR REPLACE FUNCTION public.debit_wallet_for_booking(
  p_user_id uuid,
  p_booking_id uuid,
  p_amount numeric  -- kept for signature compat, not used (we read price_inr)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_wallet record;
  v_debit numeric;
  v_remaining numeric;
  v_fully_paid boolean;
BEGIN
  -- ── Lock booking row ──
  SELECT id, user_id, price_inr, payment_status, wallet_used_amount,
         booking_type, status
    INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;

  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;

  IF v_booking.user_id <> p_user_id THEN
    RETURN jsonb_build_object('error', 'not_owner');
  END IF;

  -- ── Already paid → idempotent return ──
  IF v_booking.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'wallet_debited', COALESCE(v_booking.wallet_used_amount, 0),
      'remaining_amount', 0,
      'fully_paid', true,
      'already_paid', true,
      'already_debited', false
    );
  END IF;

  -- ── Already debited → idempotent return ──
  IF COALESCE(v_booking.wallet_used_amount, 0) > 0 THEN
    v_remaining := GREATEST(0, COALESCE(v_booking.price_inr, 0) - v_booking.wallet_used_amount);
    RETURN jsonb_build_object(
      'wallet_debited', v_booking.wallet_used_amount,
      'remaining_amount', v_remaining,
      'fully_paid', v_remaining <= 0,
      'already_paid', false,
      'already_debited', true
    );
  END IF;

  -- ── Lock wallet row ──
  SELECT balance_inr
    INTO v_wallet
    FROM public.user_wallets
   WHERE user_id = p_user_id
   FOR UPDATE;

  -- No wallet or zero balance
  IF v_wallet IS NULL OR v_wallet.balance_inr <= 0 THEN
    RETURN jsonb_build_object(
      'wallet_debited', 0,
      'remaining_amount', COALESCE(v_booking.price_inr, 0),
      'fully_paid', false,
      'already_paid', false,
      'already_debited', false
    );
  END IF;

  -- ── Calculate debit ──
  v_debit := LEAST(v_wallet.balance_inr, COALESCE(v_booking.price_inr, 0));
  v_remaining := COALESCE(v_booking.price_inr, 0) - v_debit;
  v_fully_paid := v_remaining <= 0;

  -- ── Deduct wallet ──
  UPDATE public.user_wallets
     SET balance_inr = balance_inr - v_debit,
         updated_at = now()
   WHERE user_id = p_user_id;

  -- ── Log transaction (unique index prevents double insert) ──
  INSERT INTO public.wallet_transactions
    (user_id, booking_id, type, amount_inr, reason, reference_type, reference_id, notes)
  VALUES (
    p_user_id, p_booking_id, 'debit', v_debit, 'booking_payment',
    'booking', p_booking_id,
    CASE WHEN v_fully_paid
      THEN 'Full wallet payment'
      ELSE 'Partial wallet payment (₹' || v_remaining::text || ' remaining via Razorpay)'
    END
  );

  -- ── Update booking in same transaction ──
  IF v_fully_paid THEN
    UPDATE public.bookings
       SET wallet_used_amount = v_debit,
           razorpay_paid_amount = 0,
           payment_status = 'paid',
           payment_method = 'wallet',
           paid_at = now()
     WHERE id = p_booking_id;
  ELSE
    UPDATE public.bookings
       SET wallet_used_amount = v_debit,
           razorpay_paid_amount = v_remaining
     WHERE id = p_booking_id;
  END IF;

  RETURN jsonb_build_object(
    'wallet_debited', v_debit,
    'remaining_amount', v_remaining,
    'fully_paid', v_fully_paid,
    'already_paid', false,
    'already_debited', false,
    'wallet_balance', v_wallet.balance_inr - v_debit
  );
END;
$$;
