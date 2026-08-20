-- ============================================================================
-- Scheduled Slot Surge Pricing — Backend Migration
-- ============================================================================
-- Ensures slot surge pricing is authoritative and enforced server-side.
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
  v_prev_total    numeric;
BEGIN
  -- 1. Snapshot input values
  v_service_key := COALESCE(NEW.service_type, 'maid');
  v_base        := COALESCE(NEW.base_price_inr, 0);
  v_loyalty     := COALESCE(NEW.loyalty_surge_amount, 0);

  -- 2. Determine slot surge on INSERT
  IF TG_OP = 'INSERT' THEN
    
    -- Identify the relevant slot time
    IF NEW.booking_type = 'scheduled' AND NEW.scheduled_time IS NOT NULL THEN
      -- Scheduled: use the picked slot exactly.
      v_slot := NEW.scheduled_time;
    ELSIF NEW.booking_type = 'instant' THEN
      -- Instant: round current IST time DOWN to the largest configured slot.
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

    -- Look up the surge amount
    IF v_slot IS NOT NULL THEN
      SELECT COALESCE(surge_amount, 0) INTO v_slot_surge
      FROM public.slot_surge_pricing
      WHERE community_id = NEW.community_id
        AND service_key   = v_service_key
        AND slot_time     = v_slot
        AND is_active     = TRUE
      LIMIT 1;
    END IF;

    -- Update surcharge fields (Server is source of truth)
    NEW.surcharge_amount := COALESCE(v_slot_surge, 0);
    NEW.surcharge_reason := CASE
      WHEN v_slot_surge > 0 THEN 'peak_hour'
      WHEN v_slot_surge < 0 THEN 'off_peak_discount'
      ELSE NULL
    END;

    -- Final authoritative price calculation
    -- Logic: Total = Base + Loyalty + Slot Surge
    NEW.price_inr := v_base + v_loyalty + COALESCE(v_slot_surge, 0);
    
    -- Optional: snapshot the slot time for auditing
    -- NEW.slot_surge_time := v_slot;
  END IF;

  RETURN NEW;
END;
$$;
