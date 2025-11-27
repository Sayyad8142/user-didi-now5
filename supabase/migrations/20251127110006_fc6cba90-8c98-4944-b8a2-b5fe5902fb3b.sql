
-- Fix duplicate community issue
-- We have two communities for Prestige High Fields:
-- 1. Old: "Prestige High Fields" with value "prestige-high-fields" (correct)
-- 2. New: "PRESTIGE HIGH FIELDS " with value "prestige_high_fields_" (duplicate)

-- Step 1: Get the correct community ID (the older one)
DO $$
DECLARE
  correct_community_id UUID;
  duplicate_community_id UUID;
BEGIN
  -- Get the older community (correct one)
  SELECT id INTO correct_community_id
  FROM communities
  WHERE value = 'prestige-high-fields'
  LIMIT 1;

  -- Get the duplicate community
  SELECT id INTO duplicate_community_id
  FROM communities
  WHERE value = 'prestige_high_fields_'
  LIMIT 1;

  -- Step 2: Update profiles to use the correct community
  UPDATE profiles
  SET community = 'prestige-high-fields',
      community_id = correct_community_id
  WHERE community = 'prestige_high_fields_' 
     OR community_id = duplicate_community_id;

  -- Step 3: Update bookings to use the correct community value
  UPDATE bookings
  SET community = 'prestige-high-fields'
  WHERE community = 'prestige_high_fields_';

  -- Step 4: Update buildings to reference the correct community
  UPDATE buildings
  SET community_id = correct_community_id
  WHERE community_id = duplicate_community_id;

  -- Step 5: Update flats to reference the correct community
  UPDATE flats
  SET community_id = correct_community_id
  WHERE community_id = duplicate_community_id;

  -- Step 6: Delete the duplicate community
  DELETE FROM communities
  WHERE id = duplicate_community_id;

  RAISE NOTICE 'Successfully merged duplicate communities';
END $$;
