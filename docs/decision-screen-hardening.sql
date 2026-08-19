-- 1. Add column to track customer "Keep Searching" decision
ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS customer_continue_waiting_at timestamptz;

-- 2. Hardened Cancellation RPC with atomicity and exact refund amount return
CREATE OR REPLACE FUNCTION public.cancel_unassigned_booking(
  p_booking_id uuid,
  p_reason text DEFAULT 'Customer opted to cancel after wait threshold'
)
RETURNS TABLE (
  success boolean,
  refund_amount integer,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_refund_val integer;
BEGIN
  -- 1. Atomic lock and check status
  SELECT * INTO v_booking 
  FROM public.bookings 
  WHERE id = p_booking_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Booking not found';
    RETURN;
  END IF;

  -- 2. Guard against worker assignment or other terminal states
  IF v_booking.worker_id IS NOT NULL OR v_booking.status != 'pending' THEN
    RETURN QUERY SELECT false, 0, 'A worker just accepted your booking';
    RETURN;
  END IF;

  -- 3. Idempotency check (already cancelled)
  IF v_booking.status = 'cancelled' THEN
    RETURN QUERY SELECT true, COALESCE(v_booking.wallet_refund_amount, 0), 'Already cancelled';
    RETURN;
  END IF;

  -- 4. Atomic Update
  UPDATE public.bookings
  SET 
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = 'user',
    cancellation_reason = p_reason,
    cancel_source = 'user',
    cancel_reason = p_reason,
    updated_at = now()
  WHERE id = p_booking_id;

  -- 5. Trigger refund (handled by trg_auto_wallet_refund_on_cancel but we capture amount)
  -- The trigger calls credit_wallet_on_cancel which sets payment_status = 'moved_to_wallet'
  -- and wallet_refund_amount = payment_amount_inr.
  
  -- Re-select to get exact amount after trigger
  SELECT payment_amount_inr INTO v_refund_val FROM public.bookings WHERE id = p_booking_id;

  RETURN QUERY SELECT true, COALESCE(v_refund_val, 0), 'Booking cancelled and refunded to wallet';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_unassigned_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_unassigned_booking(uuid, text) TO service_role;
