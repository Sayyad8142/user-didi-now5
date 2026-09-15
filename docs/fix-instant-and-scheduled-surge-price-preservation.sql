-- =====================================================================
-- Preserve the server-validated slot adjustment in bookings.price_inr
-- Run on the EXTERNAL production DB (api.didisnow.com).
-- =====================================================================
--
-- ROOT CAUSE
--   enforce_booking_flat_size_and_price() recomputed, on every INSERT:
--       NEW.price_inr := base + loyalty + <its own slot lookup>
--   For INSTANT bookings its lookup (largest active slot <= now IST) can
--   resolve to a different slot than the one quoted/charged (slot rollover,
--   missing slot row, community_id mismatch) → the surge became 0 and the
--   stored total dropped back to the plain service price, even though the
--   customer was charged (wallet/Razorpay) for the full amount.
--
-- FIX
--   The edge functions (create-razorpay-order / create-paid-booking) now
--   validate AND persist surcharge_amount for both instant and scheduled
--   bookings, and set price_inr = base + loyalty + surcharge.
--   This trigger therefore trusts an already-composed, paid row and only
--   recomputes when the caller did not supply a consistent composition.
--   No new pricing rule is introduced — the formula is unchanged.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_booking_flat_size_and_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_ist       time;
  v_slot          time;
  v_slot_surge    numeric := 0;
  v_service_key   text;
  v_base          numeric;
  v_loyalty       numeric;
  v_declared      numeric;
BEGIN
  v_service_key := COALESCE(NEW.service_type, 'maid');
  v_base        := COALESCE(NEW.base_price_inr, 0);
  v_loyalty     := COALESCE(NEW.loyalty_surge_amount, 0);

  IF TG_OP = 'INSERT' THEN

    -- 1. Trust an already server-composed row: total = base + loyalty + surcharge.
    IF v_base > 0 AND NEW.surcharge_amount IS NOT NULL THEN
      v_declared := v_base + v_loyalty + NEW.surcharge_amount;
      IF ABS(COALESCE(NEW.price_inr, 0) - v_declared) <= 1 THEN
        NEW.price_inr := v_declared;   -- keep the charged amount intact
        RETURN NEW;
      END IF;
    END IF;

    -- 2. Otherwise derive the slot adjustment ourselves (legacy callers).
    IF NEW.booking_type = 'scheduled' AND NEW.scheduled_time IS NOT NULL THEN
      v_slot := NEW.scheduled_time;
    ELSIF NEW.booking_type = 'instant' THEN
      v_now_ist := (now() AT TIME ZONE 'Asia/Kolkata')::time;
      SELECT slot_time INTO v_slot
      FROM public.slot_surge_pricing
      WHERE community_id = NEW.community_id
        AND service_key   = v_service_key
        AND is_active     = TRUE
        AND slot_time    <= v_now_ist
      ORDER BY slot_time DESC
      LIMIT 1;
    END IF;

    IF v_slot IS NOT NULL THEN
      SELECT COALESCE(surge_amount, 0) INTO v_slot_surge
      FROM public.slot_surge_pricing
      WHERE community_id = NEW.community_id
        AND service_key   = v_service_key
        AND slot_time     = v_slot
        AND is_active     = TRUE
      LIMIT 1;
    END IF;

    NEW.surcharge_amount := COALESCE(v_slot_surge, 0);
    NEW.surcharge_reason := CASE
      WHEN v_slot_surge > 0 THEN 'peak_hour'
      WHEN v_slot_surge < 0 THEN 'off_peak_discount'
      ELSE NULL
    END;

    IF v_base > 0 THEN
      NEW.price_inr := v_base + v_loyalty + COALESCE(v_slot_surge, 0);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- Optional audit of historical rows where the stored total lost the surge
-- (read-only):
--
--   SELECT id, booking_type, created_at, base_price_inr, loyalty_surge_amount,
--          surcharge_amount, price_inr, payment_amount_inr
--   FROM public.bookings
--   WHERE payment_amount_inr IS NOT NULL
--     AND ABS(payment_amount_inr - price_inr) > 1
--   ORDER BY created_at DESC
--   LIMIT 100;
-- =====================================================================
