-- =============================================================
-- UNIVERSAL REFUND RESOLVER — refund exactly what the customer paid
-- Run on the EXTERNAL Supabase project (api.didisnow.com)
-- =============================================================
--
-- Guarantees:
--   • refund = actual amount debited (wallet ledger debits + razorpay capture)
--     fallback → payment_amount_inr → price_inr.  base_price_inr is NEVER used
--     and surge/discount is NEVER recalculated at cancellation time.
--   • Fully atomic: booking row + wallet row locked FOR UPDATE inside one
--     transaction, so two concurrent cancellations cannot both credit.
--   • Idempotent: re-running tops up a shortfall, claws back an over-refund,
--     and otherwise does nothing.
--   • Fires on EVERY cancellation source (user / admin / worker / system /
--     dispatch timeout / no-worker timeout), because it is wired to the
--     bookings AFTER UPDATE trigger below — no hourly sweep required.
-- =============================================================

-- ─── 1. Atomic refund RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_booking_actual_paid(
  p_booking_id uuid,
  p_reason text DEFAULT 'booking_cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b            record;
  v_wallet_debit numeric := 0;
  v_paid         numeric := 0;
  v_credited     numeric := 0;
  v_corrected    numeric := 0;
  v_net          numeric := 0;
  v_delta        numeric := 0;
BEGIN
  -- Serialize per booking: concurrent callers queue here.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_booking_id::text, 0));

  SELECT * INTO v_b
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;

  IF v_b.otp_verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'otp_verified');
  END IF;

  IF COALESCE(v_b.payment_status, '') NOT IN ('paid', 'moved_to_wallet') THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'booking_not_paid');
  END IF;

  -- Ground truth: what actually left the customer.
  SELECT COALESCE(SUM(amount_inr), 0) INTO v_wallet_debit
  FROM public.wallet_transactions
  WHERE booking_id = p_booking_id
    AND type = 'debit'
    AND COALESCE(reason, '') <> 'refund_correction';

  v_paid := GREATEST(v_wallet_debit, 0) + GREATEST(COALESCE(v_b.razorpay_paid_amount, 0), 0);

  IF v_paid <= 0 THEN
    v_paid := GREATEST(COALESCE(v_b.wallet_used_amount, 0), 0)
            + GREATEST(COALESCE(v_b.razorpay_paid_amount, 0), 0);
  END IF;
  IF v_paid <= 0 THEN
    v_paid := GREATEST(COALESCE(v_b.payment_amount_inr, 0), 0);
  END IF;
  IF v_paid <= 0 THEN
    v_paid := GREATEST(COALESCE(v_b.price_inr, 0), 0);
  END IF;
  -- base_price_inr intentionally never consulted.

  IF v_paid <= 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'zero_amount');
  END IF;

  v_paid := ROUND(v_paid, 2);

  -- Already refunded / already corrected for this booking.
  SELECT COALESCE(SUM(amount_inr), 0) INTO v_credited
  FROM public.wallet_transactions
  WHERE booking_id = p_booking_id AND type = 'credit';

  SELECT COALESCE(SUM(amount_inr), 0) INTO v_corrected
  FROM public.wallet_transactions
  WHERE booking_id = p_booking_id
    AND type = 'debit'
    AND COALESCE(reason, '') = 'refund_correction';

  v_net   := ROUND(v_credited - v_corrected, 2);
  v_delta := ROUND(v_paid - v_net, 2);

  -- Lock wallet row (create lazily if missing).
  INSERT INTO public.user_wallets (user_id, balance_inr)
  VALUES (v_b.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM 1 FROM public.user_wallets WHERE user_id = v_b.user_id FOR UPDATE;

  IF v_delta >= 0.5 THEN
    UPDATE public.user_wallets
      SET balance_inr = balance_inr + v_delta, updated_at = now()
      WHERE user_id = v_b.user_id;

    INSERT INTO public.wallet_transactions
      (user_id, booking_id, type, amount_inr, reason, reference_type, reference_id, notes)
    VALUES (
      v_b.user_id, p_booking_id, 'credit', v_delta, p_reason, 'booking_refund', p_booking_id,
      CASE WHEN v_net > 0
        THEN format('Refund adjustment for cancelled booking (paid ₹%s)', v_paid)
        ELSE format('Refund for cancelled booking (paid ₹%s)', v_paid) END
    );

  ELSIF v_delta <= -0.5 THEN
    -- An older trigger over-refunded (e.g. credited pre-discount price).
    UPDATE public.user_wallets
      SET balance_inr = balance_inr + v_delta, updated_at = now()
      WHERE user_id = v_b.user_id;

    INSERT INTO public.wallet_transactions
      (user_id, booking_id, type, amount_inr, reason, reference_type, reference_id, notes)
    VALUES (
      v_b.user_id, p_booking_id, 'debit', ABS(v_delta), 'refund_correction', 'booking_refund', p_booking_id,
      format('Refund corrected to amount actually paid (₹%s)', v_paid)
    );
  ELSE
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', CASE WHEN v_net > 0 THEN 'already_refunded' ELSE 'nothing_due' END,
      'paid_amount', v_paid,
      'already_credited', v_net,
      'refund_amount', v_net
    );
  END IF;

  UPDATE public.bookings
    SET wallet_refund_status = 'credited',
        wallet_refund_amount = v_paid,
        wallet_refund_reason = p_reason
    WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'refunded', true,
    'paid_amount', v_paid,
    'already_credited', v_net,
    'applied_delta', v_delta,
    'refund_amount', v_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_booking_actual_paid(uuid, text) TO service_role;

-- ─── 2. Universal trigger: refund immediately on ANY cancellation ──
-- Covers admin app, worker app, DB jobs and direct SQL cancellations, so no
-- caller depends on the hourly sla-checker sweep.
CREATE OR REPLACE FUNCTION public.trg_refund_on_booking_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.status = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled')
     OR (NEW.cancelled_at IS NOT NULL AND OLD.cancelled_at IS NULL) THEN
    BEGIN
      PERFORM public.refund_booking_actual_paid(
        NEW.id,
        COALESCE(NULLIF(NEW.cancel_source, ''), 'system') || '_cancelled'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'refund_booking_actual_paid failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- Retire the old amount-agnostic refund trigger(s) so they cannot credit the
-- pre-discount price alongside this one.
DROP TRIGGER IF EXISTS auto_wallet_refund_on_cancel ON public.bookings;
DROP TRIGGER IF EXISTS trg_auto_wallet_refund_on_cancel ON public.bookings;

DROP TRIGGER IF EXISTS trg_refund_on_booking_cancel ON public.bookings;
CREATE TRIGGER trg_refund_on_booking_cancel
AFTER UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_refund_on_booking_cancel();

-- ─── 3. Verification queries ──────────────────────────────────
-- Paid vs refunded per cancelled booking:
--   SELECT b.id,
--          COALESCE(b.wallet_used_amount,0) AS wallet_used,
--          COALESCE(b.razorpay_paid_amount,0) AS razorpay_paid,
--          b.payment_amount_inr, b.price_inr, b.base_price_inr,
--          (SELECT COALESCE(SUM(amount_inr),0) FROM wallet_transactions t
--             WHERE t.booking_id=b.id AND t.type='credit') AS credited,
--          (SELECT COALESCE(SUM(amount_inr),0) FROM wallet_transactions t
--             WHERE t.booking_id=b.id AND t.type='debit'
--               AND t.reason='refund_correction') AS corrected,
--          b.cancel_source, b.wallet_refund_amount
--   FROM bookings b
--   WHERE b.status='cancelled' AND b.payment_status IN ('paid','moved_to_wallet')
--   ORDER BY b.cancelled_at DESC LIMIT 50;
--
-- Concurrency check (run twice in parallel, expect one refund + one skip):
--   SELECT public.refund_booking_actual_paid('<booking-uuid>', 'user_cancelled');
