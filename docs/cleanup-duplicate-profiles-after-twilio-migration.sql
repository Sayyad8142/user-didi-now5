-- =============================================================================
-- Cleanup: bad duplicate profiles created during Twilio OTP migration testing
-- =============================================================================
-- Symptom: Old Firebase users signed in with Twilio OTP and a NEW profile row
-- was created with default values (full_name='User' or '+91...', community='other',
-- flat_no='', firebase_uid='phone:+91XXXXXXXXXX') because bootstrap-profile
-- couldn't match the legacy phone format. The OLD profile (with real name,
-- community, flat, bookings, wallet) was left untouched but orphaned from the
-- new Firebase UID.
--
-- Strategy:
--   1. INSPECT — find phone numbers that have BOTH a "good" old profile AND a
--      "bad" new default profile.
--   2. RELINK   — copy the new Firebase UID onto the OLD profile so login
--      resolves to the real account.
--   3. DELETE   — remove ONLY the bad default duplicate (the one with
--      community='other', flat_no='', full_name in ('User', phone)).
--
-- ⚠️  Run inspect queries first. Review results manually. Only then run the
--     UPDATE + DELETE inside a transaction.
-- ⚠️  Do NOT touch bookings, wallet, FCM tokens — they reference the OLD
--     profile.id, which we are KEEPING.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 — Inspect: list phone numbers with duplicate profiles
-- ---------------------------------------------------------------------------
WITH normalized AS (
  SELECT
    id,
    firebase_uid,
    full_name,
    phone,
    community,
    flat_no,
    created_at,
    updated_at,
    -- Normalize phone to last 10 digits for grouping
    RIGHT(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) AS phone10
  FROM public.profiles
  WHERE phone IS NOT NULL AND phone <> ''
)
SELECT
  phone10,
  COUNT(*) AS row_count,
  array_agg(id ORDER BY created_at)            AS profile_ids,
  array_agg(firebase_uid ORDER BY created_at)  AS firebase_uids,
  array_agg(full_name ORDER BY created_at)     AS names,
  array_agg(community ORDER BY created_at)     AS communities,
  array_agg(flat_no ORDER BY created_at)       AS flats,
  array_agg(created_at ORDER BY created_at)    AS created_ats
FROM normalized
WHERE phone10 ~ '^[6-9][0-9]{9}$'  -- valid Indian mobile only
GROUP BY phone10
HAVING COUNT(*) > 1
ORDER BY row_count DESC, phone10;


-- ---------------------------------------------------------------------------
-- STEP 2 — Inspect: identify the BAD default duplicates per phone
-- A "bad default" row is one that was auto-created by bootstrap-profile with
-- no real signup data: community='other' AND flat_no IS NULL/'' AND
-- full_name is either literally 'User' or equals the phone number itself.
-- ---------------------------------------------------------------------------
WITH normalized AS (
  SELECT
    p.*,
    RIGHT(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) AS phone10,
    (
      p.community = 'other'
      AND COALESCE(p.flat_no, '') = ''
      AND (
        p.full_name = 'User'
        OR p.full_name = p.phone
        OR p.full_name ~ '^\+?9?1?[6-9][0-9]{9}$'
      )
    ) AS is_default_stub
  FROM public.profiles p
  WHERE p.phone IS NOT NULL AND p.phone <> ''
),
dupes AS (
  SELECT phone10
  FROM normalized
  WHERE phone10 ~ '^[6-9][0-9]{9}$'
  GROUP BY phone10
  HAVING COUNT(*) > 1
)
SELECT
  n.phone10,
  n.id,
  n.firebase_uid,
  n.full_name,
  n.community,
  n.flat_no,
  n.created_at,
  n.is_default_stub,
  CASE WHEN n.is_default_stub THEN 'BAD (delete after relink)' ELSE 'GOOD (keep)' END AS verdict
FROM normalized n
JOIN dupes d ON d.phone10 = n.phone10
ORDER BY n.phone10, n.created_at;


-- ---------------------------------------------------------------------------
-- STEP 3 — Safety: confirm the BAD rows have NO bookings / NO wallet activity
-- If any of these return rows, STOP and investigate manually before deleting.
-- ---------------------------------------------------------------------------
WITH normalized AS (
  SELECT
    p.id,
    RIGHT(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) AS phone10,
    (
      p.community = 'other'
      AND COALESCE(p.flat_no, '') = ''
      AND (p.full_name = 'User' OR p.full_name = p.phone OR p.full_name ~ '^\+?9?1?[6-9][0-9]{9}$')
    ) AS is_default_stub
  FROM public.profiles p
),
dupes AS (
  SELECT phone10 FROM normalized
  WHERE phone10 ~ '^[6-9][0-9]{9}$'
  GROUP BY phone10 HAVING COUNT(*) > 1
),
bad_ids AS (
  SELECT n.id FROM normalized n
  JOIN dupes d ON d.phone10 = n.phone10
  WHERE n.is_default_stub
)
SELECT 'bookings' AS source, COUNT(*) AS bad_row_refs FROM public.bookings WHERE user_id IN (SELECT id FROM bad_ids)
UNION ALL
SELECT 'user_wallets', COUNT(*) FROM public.user_wallets WHERE user_id IN (SELECT id FROM bad_ids)
UNION ALL
SELECT 'wallet_transactions', COUNT(*) FROM public.wallet_transactions WHERE user_id IN (SELECT id FROM bad_ids)
UNION ALL
SELECT 'fcm_tokens', COUNT(*) FROM public.fcm_tokens WHERE user_id IN (SELECT id FROM bad_ids);


-- ---------------------------------------------------------------------------
-- STEP 4 — RELINK + DELETE (only run after inspecting the above!)
-- Wrap in a transaction so you can ROLLBACK if anything looks wrong.
-- ---------------------------------------------------------------------------
BEGIN;

WITH normalized AS (
  SELECT
    p.*,
    RIGHT(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) AS phone10,
    (
      p.community = 'other'
      AND COALESCE(p.flat_no, '') = ''
      AND (p.full_name = 'User' OR p.full_name = p.phone OR p.full_name ~ '^\+?9?1?[6-9][0-9]{9}$')
    ) AS is_default_stub
  FROM public.profiles p
  WHERE p.phone IS NOT NULL AND p.phone <> ''
),
groups AS (
  SELECT
    phone10,
    -- Pick the OLDEST non-stub row as the canonical "good" profile to keep
    (
      SELECT id FROM normalized n2
      WHERE n2.phone10 = n1.phone10 AND NOT n2.is_default_stub
      ORDER BY n2.created_at ASC
      LIMIT 1
    ) AS keep_id,
    -- And the NEWEST stub row whose firebase_uid is the new Twilio-format uid
    (
      SELECT firebase_uid FROM normalized n3
      WHERE n3.phone10 = n1.phone10 AND n3.is_default_stub
        AND n3.firebase_uid LIKE 'phone:+%'
      ORDER BY n3.created_at DESC
      LIMIT 1
    ) AS new_uid
  FROM normalized n1
  WHERE phone10 ~ '^[6-9][0-9]{9}$'
  GROUP BY phone10
  HAVING COUNT(*) > 1
)
-- 4a) Relink: stamp the new Twilio firebase_uid onto the OLD good profile,
--     and normalize the phone to +91XXXXXXXXXX.
UPDATE public.profiles p
SET
  firebase_uid = g.new_uid,
  phone = '+91' || g.phone10,
  updated_at = now()
FROM groups g
WHERE p.id = g.keep_id
  AND g.keep_id IS NOT NULL
  AND g.new_uid IS NOT NULL;

-- 4b) Delete only the BAD stub duplicates that have a matching "kept" sibling.
--     Re-derives the same set so we never delete a row we didn't relink against.
WITH normalized AS (
  SELECT
    p.*,
    RIGHT(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) AS phone10,
    (
      p.community = 'other'
      AND COALESCE(p.flat_no, '') = ''
      AND (p.full_name = 'User' OR p.full_name = p.phone OR p.full_name ~ '^\+?9?1?[6-9][0-9]{9}$')
    ) AS is_default_stub
  FROM public.profiles p
  WHERE p.phone IS NOT NULL AND p.phone <> ''
),
dup_phones AS (
  SELECT phone10 FROM normalized
  WHERE phone10 ~ '^[6-9][0-9]{9}$'
  GROUP BY phone10
  HAVING COUNT(*) > 1
    AND COUNT(*) FILTER (WHERE NOT is_default_stub) >= 1  -- a "good" sibling exists
)
DELETE FROM public.profiles p
USING normalized n, dup_phones d
WHERE p.id = n.id
  AND n.phone10 = d.phone10
  AND n.is_default_stub
  -- Extra paranoia: NEVER delete anything that has bookings/wallet
  AND NOT EXISTS (SELECT 1 FROM public.bookings           b WHERE b.user_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.user_wallets       w WHERE w.user_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions t WHERE t.user_id = p.id);

-- Verify before COMMIT:
SELECT 'remaining_dupes' AS what, phone10, COUNT(*)
FROM (
  SELECT RIGHT(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) AS phone10
  FROM public.profiles WHERE phone IS NOT NULL AND phone <> ''
) s
WHERE phone10 ~ '^[6-9][0-9]{9}$'
GROUP BY phone10
HAVING COUNT(*) > 1;

-- If the result above is EMPTY (or only shows expected legitimate dupes), commit.
-- Otherwise: ROLLBACK;
COMMIT;
