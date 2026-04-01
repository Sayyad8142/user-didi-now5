-- =============================================================
-- SAFE AUTOMATIC WALLET REFUND SYSTEM
-- Run this on the EXTERNAL Supabase project (paywwbuqycovjopryele)
-- Run AFTER phase1-payment-migration.sql + atomic-wallet-debit-migration.sql
-- =============================================================
-- 
-- This migration:
--   1. Adds a unique index to prevent duplicate refund credits
--   2. Replaces credit_wallet_on_cancel with a row-locked, idempotent version
--      that handles wallet-only, Razorpay-only, and mixed payments correctly
--   3. Replaces the auto_wallet_refund_on_cancel trigger to cover all
--      cancellation sources (user, admin, system)
--   4. Adds a helper RPC for admin / edge-function use
--
-- Refund amount logic:
--   • wallet-only  → refund = price_inr
--   • razorpay-only → refund = price_inr
--   • mixed (wallet + razorpay) → refund = price_inr (full amount)
--   • unpaid → no refund
--
-- Safety:
--   • Row-level FOR UPDATE locks on both booking and wallet
--   • Unique partial index prevents duplicate credit transactions
--   • Idempotent: re-calling returns silently if already refunded
--   • OTP-verified bookings cannot be refunded
-- =============================================================

-- ─── 1. Unique partial index: prevent duplicate refund credits ──
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_refund_per_booking
  ON public.wallet_transactions (booking_id, type, reason)
  WHERE type = 'credit' AND reason IN (
    'booking_cancelled',
    'no_worker_found',
    'user_cancelled_before_completion',
    'user_cancelled',
    'admin_cancelled',
    'system_expiry',
    'dispatch_expired',
    'service_issue'
  );

-- If the above is too restrictive for future reasons, use a simpler guard:
-- One refund credit per booking, regardless of reason.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_refund_credit_per_booking
  ON public.wallet_transactions (booking_id)
  WHERE type = 'credit' AND reference_type = 'booking_refund';


-- ─── 2. Improved credit_wallet_on_cancel (idempotent, row-locked) ──

CREATE OR REPLACE FUNCTION public.credit_wallet_on_cancel(
  p_booking_id uuid,
  p_reason text DEFAULT 'booking_cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_refund_amount numeric;
  v_already boolean;
BEGIN
  -- ── Lock booking row to prevent concurrent refunds ──
  SELECT id, user_id, price_inr, payment_status, payment_amount_inr,
         wallet_used_amount, razorpay_paid_amount,
         wallet_refund_status, otp_verified_at, payment_method,
         status
    INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
   FOR UPDATE;

  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;

  -- ── Guard: not paid → no refund ──
  IF v_booking.payment_status NOT IN ('paid', 'moved_to_wallet') THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'booking_not_paid',
      'payment_status', v_booking.payment_status
    );
  END IF;

  -- ── Guard: OTP verified → booking completed, no refund ──
  IF v_booking.otp_verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'otp_already_verified');
  END IF;

  -- ── Guard: already refunded → idempotent return ──
  IF v_booking.wallet_refund_status = 'credited' THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'already_refunded',
      'refund_amount', COALESCE(v_booking.wallet_refund_amount, 0)
    );
  END IF;

  -- ── Calculate refund: FULL booking price (covers all payment combos) ──
  -- For mixed payments (₹50 wallet + ₹150 razorpay on ₹200 booking),
  -- refund the full ₹200 to wallet. The Razorpay portion is NOT refunded
  -- to bank — it goes to wallet as store credit per policy.
  v_refund_amount := COALESCE(v_booking.price_inr, v_booking.payment_amount_inr, 0);

  IF v_refund_amount <= 0 THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'zero_amount'
    );
  END IF;

  -- ── Ensure wallet row exists ──
  INSERT INTO public.user_wallets (user_id, balance_inr)
  VALUES (v_booking.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- ── Lock wallet row ──
  PERFORM 1 FROM public.user_wallets
   WHERE user_id = v_booking.user_id
   FOR UPDATE;

  -- ── Credit wallet ──
  UPDATE public.user_wallets
     SET balance_inr = balance_inr + v_refund_amount,
         updated_at = now()
   WHERE user_id = v_booking.user_id;

  -- ── Log wallet transaction (unique index prevents duplicates) ──
  BEGIN
    INSERT INTO public.wallet_transactions
      (user_id, booking_id, type, amount_inr, reason, reference_type, reference_id, notes)
    VALUES (
      v_booking.user_id,
      p_booking_id,
      'credit',
      v_refund_amount,
      p_reason,
      'booking_refund',
      p_booking_id::text,
      'Refund: ' || p_reason || ' | method=' || COALESCE(v_booking.payment_method, 'unknown')
        || ' | wallet_used=' || COALESCE(v_booking.wallet_used_amount, 0)::text
        || ' | razorpay_paid=' || COALESCE(v_booking.razorpay_paid_amount, 0)::text
    );
  EXCEPTION WHEN unique_violation THEN
    -- Duplicate insert blocked by unique index — already refunded
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'duplicate_transaction_blocked',
      'refund_amount', v_refund_amount
    );
  END;

  -- ── Update booking refund tracking fields ──
  UPDATE public.bookings
     SET wallet_refund_status = 'credited',
         wallet_refund_amount = v_refund_amount,
         wallet_refund_at = now(),
         wallet_refund_reason = p_reason,
         payment_status = 'refunded_to_wallet'
   WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_amount', v_refund_amount,
    'reason', p_reason,
    'user_id', v_booking.user_id,
    'booking_id', p_booking_id
  );
END;
$$;


-- ─── 3. Trigger function: auto-refund on any cancellation ──

CREATE OR REPLACE FUNCTION public.auto_wallet_refund_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
  v_result jsonb;
BEGIN
  -- Only fire when status transitions TO 'cancelled'
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    -- Only refund paid bookings where OTP was NOT verified
    IF NEW.payment_status IN ('paid') AND NEW.otp_verified_at IS NULL THEN
      -- Determine refund reason from cancellation metadata
      v_reason := COALESCE(
        NEW.cancellation_reason,
        CASE NEW.cancelled_by
          WHEN 'admin' THEN 'admin_cancelled'
          WHEN 'system' THEN 'no_worker_found'
          WHEN 'user' THEN 'user_cancelled_before_completion'
          ELSE 'booking_cancelled'
        END
      );

      v_result := public.credit_wallet_on_cancel(NEW.id, v_reason);

      -- Log for debugging (visible in Postgres logs)
      RAISE NOTICE 'auto_wallet_refund: booking=% result=%', NEW.id, v_result;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger (covers UPDATE path — status changes to cancelled)
DROP TRIGGER IF EXISTS trg_auto_wallet_refund_on_cancel ON public.bookings;
CREATE TRIGGER trg_auto_wallet_refund_on_cancel
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_wallet_refund_on_cancel();


-- ─── 4. Admin/Edge-function helper RPC ──
-- Call this from admin panel or edge functions to manually trigger a refund.
-- Safe to call multiple times — fully idempotent.

CREATE OR REPLACE FUNCTION public.admin_refund_booking_to_wallet(
  p_booking_id uuid,
  p_reason text DEFAULT 'admin_cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This is a thin wrapper that delegates to the main refund function.
  -- It exists so we can add admin-specific audit logging later.
  RETURN public.credit_wallet_on_cancel(p_booking_id, p_reason);
END;
$$;


-- ─── 5. Verify: test queries (run manually to confirm) ──
-- 
-- Test 1: Check refund for a specific booking
--   SELECT public.credit_wallet_on_cancel('booking-uuid-here', 'admin_cancelled');
--
-- Test 2: Verify no duplicates
--   SELECT * FROM wallet_transactions 
--   WHERE booking_id = 'booking-uuid-here' AND type = 'credit';
--
-- Test 3: Check wallet balance
--   SELECT * FROM user_wallets WHERE user_id = 'user-uuid-here';
