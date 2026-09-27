-- =============================================================
-- TIP YOUR DIDI — run on the PRODUCTION project (paywwbuqycovjopryele)
-- Supabase dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run. Does not change bookings pricing, payouts formula,
-- existing wallet functions or service refunds.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.booking_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  worker_id uuid,
  tip_amount numeric NOT NULL CHECK (tip_amount IN (10,20,30,40,50)),
  wallet_amount_used numeric NOT NULL DEFAULT 0,
  razorpay_amount_used numeric NOT NULL DEFAULT 0,
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  razorpay_credited boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL UNIQUE,
  -- pending | paid | credited_to_worker | refunded | rejected | failed
  status text NOT NULL DEFAULT 'pending',
  failure_reason text,
  paid_at timestamptz,
  credited_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_tips_booking_idx ON public.booking_tips(booking_id);
CREATE INDEX IF NOT EXISTS booking_tips_worker_idx ON public.booking_tips(worker_id);

GRANT ALL ON public.booking_tips TO service_role;
ALTER TABLE public.booking_tips ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: read/write only via edge functions (service role).

ALTER TABLE public.worker_payouts ADD COLUMN IF NOT EXISTS tip_amount numeric NOT NULL DEFAULT 0;

-- ---------- helper: ledger insert that never aborts the transaction ----------
CREATE OR REPLACE FUNCTION public._tip_ledger(p_user uuid, p_booking uuid, p_type text, p_amount numeric, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.wallet_transactions(user_id, booking_id, type, amount_inr, reason)
    VALUES (p_user, p_booking, p_type, p_amount, p_reason);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tip ledger insert skipped: %', SQLERRM;
  END;
END $$;

-- ---------- helper: wallet delta with row lock ----------
CREATE OR REPLACE FUNCTION public._tip_wallet_delta(p_user uuid, p_delta numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal numeric;
BEGIN
  INSERT INTO public.user_wallets(user_id, balance_inr) VALUES (p_user, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_inr INTO v_bal FROM public.user_wallets WHERE user_id = p_user FOR UPDATE;
  IF v_bal + p_delta < 0 THEN RETURN false; END IF;
  UPDATE public.user_wallets SET balance_inr = v_bal + p_delta, updated_at = now() WHERE user_id = p_user;
  RETURN true;
END $$;

-- ---------- apply a tip (wallet-only, or after a verified Razorpay payment) ----------
-- Razorpay part is credited to the wallet first, then the full tip is debited.
-- Idempotent by p_idempotency_key; the booking row lock serialises with
-- cancellation / completion / reassignment.
CREATE OR REPLACE FUNCTION public.apply_booking_tip(
  p_idempotency_key text, p_user_id uuid, p_booking_id uuid, p_amount numeric,
  p_razorpay_amount numeric DEFAULT 0, p_razorpay_payment_id text DEFAULT NULL, p_razorpay_order_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record; t record; v_other numeric; v_err text;
BEGIN
  IF p_amount NOT IN (10,20,30,40,50) THEN RETURN jsonb_build_object('error','invalid_amount'); END IF;
  IF p_razorpay_amount < 0 OR p_razorpay_amount > p_amount THEN RETURN jsonb_build_object('error','invalid_split'); END IF;

  SELECT id, user_id, worker_id, status INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','booking_not_found'); END IF;
  IF b.user_id <> p_user_id THEN RETURN jsonb_build_object('error','not_owner'); END IF;

  INSERT INTO public.booking_tips(booking_id, customer_id, worker_id, tip_amount, idempotency_key, razorpay_order_id)
  VALUES (p_booking_id, p_user_id, b.worker_id, p_amount, p_idempotency_key, p_razorpay_order_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO t FROM public.booking_tips WHERE idempotency_key = p_idempotency_key FOR UPDATE;

  IF t.booking_id <> p_booking_id OR t.customer_id <> p_user_id OR t.tip_amount <> p_amount THEN
    RETURN jsonb_build_object('error','idempotency_mismatch');
  END IF;
  IF t.status IN ('paid','credited_to_worker','refunded') THEN
    RETURN jsonb_build_object('success',true,'already_applied',true,'tip_id',t.id,'status',t.status);
  END IF;

  -- 1. Credit verified Razorpay money to wallet exactly once
  IF p_razorpay_amount > 0 AND NOT t.razorpay_credited THEN
    PERFORM public._tip_wallet_delta(p_user_id, p_razorpay_amount);
    PERFORM public._tip_ledger(p_user_id, p_booking_id, 'credit', p_razorpay_amount, 'tip_topup');
    UPDATE public.booking_tips SET razorpay_credited = true, razorpay_amount_used = p_razorpay_amount,
      razorpay_payment_id = COALESCE(p_razorpay_payment_id, razorpay_payment_id), updated_at = now()
      WHERE id = t.id;
  END IF;

  -- 2. Eligibility (money already in wallet stays there if rejected)
  IF b.status IN ('pending','dispatched','searching','cancelled','completed','failed','expired') OR b.worker_id IS NULL THEN
    v_err := 'booking_not_tippable';
  ELSE
    SELECT COALESCE(sum(tip_amount),0) INTO v_other FROM public.booking_tips
      WHERE booking_id = p_booking_id AND id <> t.id AND status IN ('paid','credited_to_worker');
    IF v_other + p_amount > 50 THEN v_err := 'tip_limit_exceeded'; END IF;
  END IF;
  IF v_err IS NOT NULL THEN
    UPDATE public.booking_tips SET status='rejected', failure_reason=v_err, updated_at=now() WHERE id=t.id;
    RETURN jsonb_build_object('error', v_err, 'refunded_to_wallet', p_razorpay_amount > 0 OR t.razorpay_credited);
  END IF;

  -- 3. Debit the full tip from wallet
  IF NOT public._tip_wallet_delta(p_user_id, -p_amount) THEN
    UPDATE public.booking_tips SET status='failed', failure_reason='insufficient_balance', updated_at=now() WHERE id=t.id;
    RETURN jsonb_build_object('error','insufficient_balance');
  END IF;
  PERFORM public._tip_ledger(p_user_id, p_booking_id, 'debit', p_amount, 'tip_payment');

  UPDATE public.booking_tips SET status='paid', paid_at=now(), worker_id=b.worker_id,
    wallet_amount_used = p_amount - razorpay_amount_used, failure_reason=NULL, updated_at=now()
    WHERE id=t.id;
  RETURN jsonb_build_object('success',true,'tip_id',t.id,'status','paid');
END $$;

-- ---------- booking lifecycle trigger: reassignment / completion / cancellation ----------
CREATE OR REPLACE FUNCTION public.booking_tips_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_sum numeric;
BEGIN
  -- Reassignment: tip follows the booking to the new worker
  IF NEW.worker_id IS DISTINCT FROM OLD.worker_id AND NEW.worker_id IS NOT NULL THEN
    UPDATE public.booking_tips SET worker_id = NEW.worker_id, updated_at = now()
      WHERE booking_id = NEW.id AND status = 'paid';
  END IF;

  -- Completion: 100% of paid tips go to the completing worker (no commission)
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.booking_tips SET status='credited_to_worker', worker_id = NEW.worker_id,
      credited_at = now(), updated_at = now()
      WHERE booking_id = NEW.id AND status = 'paid';
    SELECT COALESCE(sum(tip_amount),0) INTO v_sum FROM public.booking_tips
      WHERE booking_id = NEW.id AND status = 'credited_to_worker';
    UPDATE public.worker_payouts SET tip_amount = v_sum WHERE booking_id = NEW.id;
  END IF;

  -- Cancellation: refund each paid tip to the wallet once
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    FOR r IN SELECT * FROM public.booking_tips WHERE booking_id = NEW.id AND status = 'paid' FOR UPDATE LOOP
      PERFORM public._tip_wallet_delta(r.customer_id, r.tip_amount);
      PERFORM public._tip_ledger(r.customer_id, NEW.id, 'credit', r.tip_amount, 'tip_refund');
      UPDATE public.booking_tips SET status='refunded', refunded_at=now(), updated_at=now() WHERE id = r.id;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_tips_lifecycle ON public.bookings;
CREATE TRIGGER trg_booking_tips_lifecycle AFTER UPDATE OF status, worker_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.booking_tips_lifecycle();

-- Payout rows created after completion pick up the credited tip automatically
CREATE OR REPLACE FUNCTION public.worker_payout_fill_tip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT COALESCE(sum(tip_amount),0) INTO NEW.tip_amount FROM public.booking_tips
    WHERE booking_id = NEW.booking_id AND status = 'credited_to_worker';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_worker_payout_fill_tip ON public.worker_payouts;
CREATE TRIGGER trg_worker_payout_fill_tip BEFORE INSERT ON public.worker_payouts
  FOR EACH ROW EXECUTE FUNCTION public.worker_payout_fill_tip();

REVOKE ALL ON FUNCTION public.apply_booking_tip(text,uuid,uuid,numeric,numeric,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_booking_tip(text,uuid,uuid,numeric,numeric,text,text) TO service_role;
REVOKE ALL ON FUNCTION public._tip_wallet_delta(uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tip_ledger(uuid,uuid,text,numeric,text) FROM PUBLIC, anon, authenticated;
