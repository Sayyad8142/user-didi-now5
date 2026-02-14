
CREATE OR REPLACE FUNCTION public.enforce_booking_flat_size_and_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flat_id uuid;
  v_flat_size text;
  v_community text;
  v_price integer := 0;
  v_task_enum public.maid_task;
  v_task_price integer;
BEGIN
  -- Get user's flat_id and community from profile
  SELECT p.flat_id, p.community 
  INTO v_flat_id, v_community
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  -- For non-bathroom services, enforce flat_size from DB
  IF NEW.service_type != 'bathroom_cleaning' THEN
    IF v_flat_id IS NULL THEN
      RAISE EXCEPTION 'Please complete your flat details before booking.';
    END IF;
    
    SELECT f.flat_size INTO v_flat_size
    FROM public.flats f
    WHERE f.id = v_flat_id;
    
    -- Fall back to client-provided flat_size if DB flat has none
    IF v_flat_size IS NULL THEN
      v_flat_size := NEW.flat_size;
    END IF;
    
    IF v_flat_size IS NULL THEN
      RAISE EXCEPTION 'Flat size not configured. Please contact support.';
    END IF;
    
    -- Override flat_size
    NEW.flat_size := v_flat_size;
  END IF;

  -- Recalculate price server-side
  IF NEW.service_type = 'bathroom_cleaning' THEN
    SELECT bps.unit_price_inr INTO v_price
    FROM public.bathroom_pricing_settings bps
    WHERE bps.community = COALESCE(v_community, '');
    
    IF v_price IS NULL THEN
      SELECT bps.unit_price_inr INTO v_price
      FROM public.bathroom_pricing_settings bps
      WHERE bps.community = '';
    END IF;
    
    v_price := COALESCE(v_price, 250) * GREATEST(COALESCE(NEW.bathroom_count, 1), 1);
    
    IF COALESCE(NEW.has_glass_partition, false) THEN
      NEW.glass_partition_fee := 30 * GREATEST(COALESCE(NEW.bathroom_count, 1), 1);
    ELSE
      NEW.glass_partition_fee := 0;
    END IF;
    v_price := v_price + COALESCE(NEW.glass_partition_fee, 0);
    
  ELSIF NEW.service_type = 'maid' THEN
    v_price := 0;
    
    IF NEW.maid_tasks IS NOT NULL AND array_length(NEW.maid_tasks, 1) > 0 THEN
      FOREACH v_task_enum IN ARRAY NEW.maid_tasks
      LOOP
        v_task_price := NULL;
        
        SELECT mpt.price_inr INTO v_task_price
        FROM public.maid_pricing_tasks mpt
        WHERE mpt.task = v_task_enum
          AND mpt.flat_size = v_flat_size
          AND mpt.community = COALESCE(v_community, '')
          AND mpt.active = true
        LIMIT 1;
        
        IF v_task_price IS NULL THEN
          SELECT mpt.price_inr INTO v_task_price
          FROM public.maid_pricing_tasks mpt
          WHERE mpt.task = v_task_enum
            AND mpt.flat_size = v_flat_size
            AND (mpt.community IS NULL OR mpt.community = '')
            AND mpt.active = true
          LIMIT 1;
        END IF;
        
        v_price := v_price + COALESCE(v_task_price, 100);
      END LOOP;
    END IF;
    
    IF NEW.dish_intensity = 'medium' THEN
      NEW.dish_intensity_extra_inr := 30;
    ELSIF NEW.dish_intensity = 'heavy' THEN
      NEW.dish_intensity_extra_inr := 50;
    ELSE
      NEW.dish_intensity_extra_inr := 0;
    END IF;
    v_price := v_price + COALESCE(NEW.dish_intensity_extra_inr, 0);
    
  ELSE
    SELECT pr.price_inr INTO v_price
    FROM public.pricing pr
    WHERE pr.service_type = NEW.service_type
      AND pr.flat_size = v_flat_size
      AND pr.community = COALESCE(v_community, '')
      AND pr.active = true
    LIMIT 1;
    
    IF v_price IS NULL THEN
      SELECT pr.price_inr INTO v_price
      FROM public.pricing pr
      WHERE pr.service_type = NEW.service_type
        AND pr.flat_size = v_flat_size
        AND pr.community IS NULL
        AND pr.active = true
      LIMIT 1;
    END IF;
  END IF;
  
  v_price := COALESCE(v_price, 0) + COALESCE(NEW.surcharge_amount, 0);
  NEW.price_inr := v_price;
  
  RETURN NEW;
END;
$$;
