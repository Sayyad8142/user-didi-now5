-- =============================================
-- Phase 1 Fixes: Dispatch + Cancel guard + OTP
-- Run this on the EXTERNAL Supabase project (paywwbuqycovjopryele)
-- =============================================

-- 1. Update generate_completion_otp to use ONLY easy patterns (no random)
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
  -- Pick randomly from the easy-pattern pool only
  picked := otp_pool[1 + floor(random() * array_length(otp_pool, 1))::int];
  RETURN picked;
END;
$$;

-- 2. Update user_cancel_booking to block cancellation after OTP verification
-- This adds the otp_verified_at guard to the existing cancel function
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

  -- Block if already completed or cancelled
  IF v_booking.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'already_finished: Booking already completed or cancelled';
  END IF;

  -- CRITICAL: Block cancellation after OTP verification
  IF v_booking.otp_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'otp_verified: Booking already completed, cannot cancel';
  END IF;

  -- Cancel the booking
  UPDATE bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'user',
      cancellation_reason = p_reason,
      cancel_source = 'user',
      cancel_reason = p_reason
  WHERE id = p_booking_id;

  -- Cancel any active assignments
  UPDATE assignments
  SET status = 'cancelled'
  WHERE booking_id = p_booking_id
    AND status IN ('pending', 'assigned', 'accepted');
END;
$$;
