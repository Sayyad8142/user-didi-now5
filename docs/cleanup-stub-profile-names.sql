-- =============================================================================
-- Clean up auto-generated / stub profile names
-- =============================================================================
-- Context:
--   Older races between Firebase auth-state and the signup wizard caused
--   profiles to be created with full_name = the phone number (e.g. "+919000000000"),
--   the literal "User", or empty. The admin panel renders those as "UserXXXX".
--
-- What this script does:
--   1. Reports how many rows match each "bad" pattern (read-only).
--   2. Clears full_name to '' on those rows so the Profile screen prompts the
--      user to complete it on next visit and bookings/admin show
--      "Name missing" instead of "User1234".
--   3. Re-counts after the update for verification.
--
-- Safety:
--   - Only touches rows where the value is obviously auto-generated.
--   - Will NOT touch a name that contains a letter (real names always do).
--   - Idempotent: running again is a no-op.
--   - Run inside a transaction so you can ROLLBACK if numbers look wrong.
--
-- Bad-name definition (must match ALL):
--   - full_name IS NOT NULL
--   - trimmed full_name matches one of:
--       * empty string
--       * literal 'User'
--       * literal 'user'
--       * phone-shaped: ^\+?\d{7,15}$  (digits, optional leading +)
--       * 'firebase:...' fallback id
--       * 'stub:...' marker
-- =============================================================================

BEGIN;

-- 0) Snapshot table size (sanity)
SELECT 'total_profiles' AS label, count(*) FROM public.profiles;

-- 1) Dry-run: how many rows match each bad pattern?
SELECT
  count(*) FILTER (WHERE btrim(full_name) = '')                                AS empty_names,
  count(*) FILTER (WHERE btrim(full_name) ILIKE 'user')                        AS literal_user,
  count(*) FILTER (WHERE btrim(full_name) ~ '^\+?\d{7,15}$')                   AS phone_shaped_names,
  count(*) FILTER (WHERE btrim(full_name) ILIKE 'firebase:%')                  AS firebase_fallback,
  count(*) FILTER (WHERE btrim(full_name) ILIKE 'stub:%')                      AS stub_marker
FROM public.profiles
WHERE full_name IS NOT NULL;

-- 2) Preview the rows that will change (cap 50 for sanity)
SELECT id, full_name, phone, created_at
FROM public.profiles
WHERE full_name IS NOT NULL
  AND (
        btrim(full_name) = ''
     OR btrim(full_name) ILIKE 'user'
     OR btrim(full_name) ILIKE 'firebase:%'
     OR btrim(full_name) ILIKE 'stub:%'
     OR btrim(full_name) ~ '^\+?\d{7,15}$'
  )
  -- extra guard: never touch a value that contains a letter (real names always do)
  AND btrim(full_name) !~ '[A-Za-z]{2,}'
ORDER BY created_at DESC
LIMIT 50;

-- 3) Cleanup: clear the bad names so UI prompts user to complete profile.
--    We use empty string (not NULL) to stay compatible with NOT NULL columns;
--    swap to NULL if the column is nullable in your schema.
WITH bad AS (
  SELECT id
  FROM public.profiles
  WHERE full_name IS NOT NULL
    AND (
          btrim(full_name) = ''
       OR btrim(full_name) ILIKE 'user'
       OR btrim(full_name) ILIKE 'firebase:%'
       OR btrim(full_name) ILIKE 'stub:%'
       OR btrim(full_name) ~ '^\+?\d{7,15}$'
    )
    AND btrim(full_name) !~ '[A-Za-z]{2,}'
),
updated AS (
  UPDATE public.profiles p
     SET full_name = '',
         updated_at = now()
    FROM bad
   WHERE p.id = bad.id
     AND p.full_name IS DISTINCT FROM ''   -- skip already-empty rows
  RETURNING p.id
)
SELECT 'rows_updated' AS label, count(*) FROM updated;

-- 4) Post-check: bad patterns should now be zero (except empty_names which is expected)
SELECT
  count(*) FILTER (WHERE btrim(full_name) = '')                                AS empty_names_after,
  count(*) FILTER (WHERE btrim(full_name) ILIKE 'user')                        AS literal_user_after,
  count(*) FILTER (WHERE btrim(full_name) ~ '^\+?\d{7,15}$')                   AS phone_shaped_after,
  count(*) FILTER (WHERE btrim(full_name) ILIKE 'firebase:%')                  AS firebase_fallback_after,
  count(*) FILTER (WHERE btrim(full_name) ILIKE 'stub:%')                      AS stub_marker_after
FROM public.profiles
WHERE full_name IS NOT NULL;

-- Review the numbers above. If anything looks wrong, run: ROLLBACK;
-- Otherwise commit:
COMMIT;
