-- Auto-link profiles that have flat_no matching a flat in their community but missing flat_id/building_id/community_id
-- This fixes users who registered before the flat linking feature was added

UPDATE profiles p
SET 
  flat_id = f.id,
  building_id = f.building_id,
  community_id = c.id
FROM communities c
JOIN flats f ON f.community_id = c.id
WHERE p.community = c.value
  AND p.flat_no = f.flat_no
  AND p.flat_id IS NULL
  AND p.community != 'other';
