-- ============================================================================
-- Instant Slot Surge Pricing — Backend Migration
-- ============================================================================
-- Extends the existing slot_surge_pricing system to apply to INSTANT bookings.
-- Previously only booking_type = 'scheduled' received slot surge; now instant
-- bookings snapshot the CURRENT IST slot's surge at insert time.
--
-- Once applied, the DB trigger becomes the single source of truth:
--   - Rounds `now()` (IST) down to the largest configured slot_time
--   - Looks up matching row in slot_surge_pricing for the booking's
--     community_id + service_key
--   - Sets NEW.surcharge_amount, NEW.surcharge_reason, and adjusts
--     NEW.price_inr = base_price_inr + loyalty_surge_amount + surcharge_amount
--
-- Historical bookings are NEVER re-priced. Frozen values on old rows stay.
-- Worker payout logic is unaffected.
--
-- Run on the EXTERNAL Supabase project (api.didisnow.com).
-- ============================================================================

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
BEGIN
  -- ── existing flat-size enforcement stays as-is (omitted here for brevity)
  -- Assume prior logic already ran / merge with your live function body.

  -- Only compute slot surge on INSERT for both instant and scheduled bookings.
  IF TG_OP = 'INSERT' THEN

    v_service_key := COALESCE(NEW.service_type, 'maid');

    IF NEW.booking_type = 'scheduled' AND NEW.scheduled_time IS NOT NULL THEN
      -- Scheduled: use the user-picked slot exactly.
      v_slot := NEW.scheduled_time;

    ELSIF NEW.booking_type = 'instant' THEN
      -- Instant: round current IST time DOWN to the largest configured slot.
      v_now_ist := (now() AT TIME ZONE 'Asia/Kolkata')::time;

      SELECT slot_time
        INTO v_slot
        FROM public.slot_surge_pricing
       WHERE community_id = NEW.community_id
         AND service_key   = v_service_key
         AND is_active     = TRUE
         AND slot_time    <= v_now_ist
       ORDER BY slot_time DESC
       LIMIT 1;
    END IF;

    IF v_slot IS NOT NULL THEN
      SELECT COALESCE(surge_amount, 0)
        INTO v_slot_surge
        FROM public.slot_surge_pricing
       WHERE community_id = NEW.community_id
         AND service_key   = v_service_key
         AND slot_time     = v_slot
         AND is_active     = TRUE
       LIMIT 1;
    END IF;

    v_base    := COALESCE(NEW.base_price_inr, NEW.price_inr, 0);
    v_loyalty := COALESCE(NEW.loyalty_surge_amount, 0);

    -- Server is source of truth: overwrite whatever the client sent.
    NEW.surcharge_amount := COALESCE(v_slot_surge, 0);
    NEW.surcharge_reason := CASE
      WHEN v_slot_surge > 0 THEN 'peak_hour'
      WHEN v_slot_surge < 0 THEN 'off_peak_discount'
      ELSE NULL
    END;

    NEW.price_inr := v_base + v_loyalty + COALESCE(v_slot_surge, 0);

    -- Optionally snapshot which slot was used (comment out if column absent)
    -- NEW.slot_surge_time := v_slot;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger binding is unchanged (existing BEFORE INSERT trigger on bookings).
--
-- Verify with:
--   SELECT booking_type, price_inr, base_price_inr, loyalty_surge_amount,
--          surcharge_amount, surcharge_reason
--   FROM public.bookings
--   ORDER BY created_at DESC LIMIT 20;
