-- Allow users to cancel bookings anytime by removing the cancellation window check
DROP FUNCTION IF EXISTS public.user_cancel_booking(uuid, text);

CREATE OR REPLACE FUNCTION public.user_cancel_booking(p_booking_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b record;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;

  IF b.id IS NULL THEN
    RAISE EXCEPTION 'booking_not_found';
  END IF;

  IF b.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF b.cancelled_at IS NOT NULL OR b.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'already_finished';
  END IF;

  -- Removed: cancellation window check to allow cancellation anytime

  UPDATE public.bookings
  SET status='cancelled',
      cancelled_at=now(),
      cancel_reason=COALESCE(p_reason,''),
      cancel_source='user',
      updated_at=now()
  WHERE id = p_booking_id;
END;
$function$;