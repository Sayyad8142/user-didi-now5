-- =============================================================
-- SAFE WALLET INCREMENT RPC
-- Run this on the EXTERNAL Supabase project (paywwbuqycovjopryele)
-- =============================================================
--
-- This function atomically adjusts a wallet balance by a delta amount.
-- It is concurrency-safe (uses FOR UPDATE row lock) and prevents
-- balance from going below p_min_balance.
--
-- Used by create-paid-booking for:
--   - Wallet debits (p_amount_delta = -X)
--   - Refunds on failure (p_amount_delta = +X)
--
-- This replaces unsafe snapshot-based overwrites.
-- =============================================================

CREATE OR REPLACE FUNCTION public.safe_wallet_increment(
  p_user_id uuid,
  p_amount_delta numeric,
  p_min_balance numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance numeric;
  v_new_balance numeric;
BEGIN
  -- Ensure wallet exists
  INSERT INTO public.user_wallets (user_id, balance_inr)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock the wallet row
  SELECT balance_inr INTO v_current_balance
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_new_balance := v_current_balance + p_amount_delta;

  -- Prevent negative balance (for debits)
  IF v_new_balance < p_min_balance THEN
    RETURN jsonb_build_object(
      'error', 'insufficient_balance',
      'current_balance', v_current_balance,
      'requested_delta', p_amount_delta
    );
  END IF;

  -- Apply the increment atomically
  UPDATE public.user_wallets
  SET balance_inr = v_new_balance,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance,
    'delta', p_amount_delta
  );
END;
$$;
